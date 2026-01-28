import { app, BrowserWindow, ipcMain, dialog } from 'electron';
import * as path from 'path';
import * as fs from 'fs';
import { FileFormat, ValidationResult, ParsedResume } from '../types';
import { fileExtractor } from './fileExtractor';
import { vaultManager } from './vaultManager';
import type { Vault, VaultSection, SectionObject, VaultItem, SectionType } from '../types/vault';
import { obsidianClient } from './obsidianClient';
import { jobQueue } from './jobQueue';
import { csvImporter } from './csvImporter';
import { opusAgent, jobSearchAgent } from '../agents';
import { queueProcessor } from './queueProcessor';
import { settingsStore } from './settingsStore';
import { appStateStore } from './appStateStore';
import { applicationsStore, ApplicationStatus } from './applicationsStore';
import { knowledgeBaseStore, KnowledgeBaseEntry, KnowledgeBaseFilters } from './knowledgeBaseStore';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import { chromium, Browser } from 'playwright-core';

let mainWindow: BrowserWindow | null = null;
let parsedResumeData: ParsedResume | null = null;

// Current vault ID for the session
let currentVaultId: string | null = null;

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

// Helper to build metadata for different content types
function buildMetadataForType(type: string, formData: any): any {
  switch (type) {
    case 'job_entry':
      return {
        type: 'experience',
        title: formData.metadata?.title || formData.content || '',
        company: formData.metadata?.company || '',
        location: formData.metadata?.location || null,
        startDate: formData.metadata?.dateRange?.start || '',
        endDate: formData.metadata?.dateRange?.end || null
      };
    case 'education':
      return {
        type: 'education',
        degree: formData.metadata?.degree || formData.content || '',
        institution: formData.metadata?.institution || '',
        location: formData.metadata?.location || null,
        startDate: formData.metadata?.dateRange?.start || null,
        endDate: formData.metadata?.dateRange?.end || null
      };
    case 'certification':
      return {
        type: 'certification',
        name: formData.metadata?.name || formData.content || '',
        issuer: formData.metadata?.issuer || '',
        issueDate: formData.metadata?.dateRange?.start || '',
        expirationDate: formData.metadata?.dateRange?.end || null
      };
    case 'skill':
      return {
        type: 'skills-group',
        category: formData.metadata?.category || 'General'
      };
    default:
      return {
        type: 'summary',
        title: formData.content || ''
      };
  }
}
const SUPPORTED_FORMATS: FileFormat[] = [FileFormat.PDF, FileFormat.DOCX, FileFormat.TXT];

function createWindow() {
  console.log('[Main] Creating window...');
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: true,
      contextIsolation: false
    }
  });

  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173');
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));
  }

  // Open devtools automatically for debugging
  mainWindow.webContents.openDevTools();

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
  console.log('[Main] Window created');
}

// Get file format from extension
function getFileFormat(fileName: string): FileFormat | null {
  const ext = path.extname(fileName).toLowerCase();
  switch (ext) {
    case '.pdf':
      return FileFormat.PDF;
    case '.docx':
    case '.doc':
      return FileFormat.DOCX;
    case '.txt':
      return FileFormat.TXT;
    default:
      return null;
  }
}

// Validate file
function validateFile(filePath: string, fileName: string, fileSize: number): ValidationResult {
  const format = getFileFormat(fileName);

  // Check if format is supported
  if (!format) {
    return {
      isValid: false,
      errorMessage: `Unsupported file format. Supported formats: ${SUPPORTED_FORMATS.join(', ').toUpperCase()}`,
      fileSize,
      format: FileFormat.TXT // Default for type safety
    };
  }

  // Check file size
  if (fileSize >= MAX_FILE_SIZE) {
    return {
      isValid: false,
      errorMessage: `File size exceeds the maximum limit of ${MAX_FILE_SIZE / (1024 * 1024)}MB`,
      fileSize,
      format
    };
  }

  // Check if file exists and is readable
  try {
    fs.accessSync(filePath, fs.constants.R_OK);
  } catch (error) {
    return {
      isValid: false,
      errorMessage: 'File is not readable or does not exist',
      fileSize,
      format
    };
  }

  return {
    isValid: true,
    fileSize,
    format
  };
}


// Helper to wait for page load after navigation
function waitForPageLoad(window: BrowserWindow): Promise<void> {
  return new Promise((resolve) => {
    // Register listener BEFORE loadFile returns control
    window.webContents.once('did-finish-load', () => {
      console.log('did-finish-load event fired');
      resolve();
    });
  });
}

// IPC handlers
ipcMain.handle('validate-file', async (event, fileData) => {
  try {
    const result = validateFile(fileData.path, fileData.name, fileData.size);
    return result;
  } catch (error) {
    console.error('File validation error:', error);
    return {
      isValid: false,
      errorMessage: 'Failed to validate file: ' + (error as Error).message,
      fileSize: fileData.size,
      format: FileFormat.TXT
    };
  }
});

ipcMain.handle('process-resume', async (event, fileData) => {
  try {
    // 0. Check for API key configuration first
    if (!settingsStore.hasValidKey()) {
      const error = new Error(
        'API key not configured. Please configure your API key in Settings before processing resumes.'
      );
      (error as any).recoverable = true;
      (error as any).suggestedAction = 'Go to Settings to add your API key.';
      throw error;
    }

    // 1. Detect file format
    const format = getFileFormat(fileData.name);
    if (!format) {
      throw new Error(`Unsupported file format: ${fileData.name}`);
    }

    // 2. Extract text from file
    console.log(`Extracting text from: ${fileData.name}`);
    const extractionResult = await fileExtractor.extractText(fileData.path, format);
    const text = extractionResult.text;

    if (!text || text.trim().length === 0) {
      throw new Error('No text content extracted from file');
    }

    console.log(`Extracted ${text.length} characters from resume`);

    // 3. Parse with ResumeParser into hierarchical vault structure
    console.log('Parsing resume into hierarchical vault structure...');
    const parseResult = await vaultManager.parseAndImport(text, fileData.name);
    currentVaultId = parseResult.vault.id;

    // Convert vault structure to parsedResumeData format for review page compatibility
    const vault = parseResult.vault;
    const experienceSection = vault.sections.find(s => s.type === 'experience');
    const skillsSection = vault.sections.find(s => s.type === 'skills');
    const educationSection = vault.sections.find(s => s.type === 'education');
    const certificationsSection = vault.sections.find(s => s.type === 'certifications');

    // Build job entries from experience section objects
    const jobEntries = (experienceSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        title: meta.title || '',
        company: meta.company || '',
        location: meta.location || null,
        duration: {
          start: meta.startDate || '',
          end: meta.endDate || null
        },
        accomplishments: obj.items.map(item => ({
          id: item.id,
          description: item.content,
          parentJobId: obj.id,
          tags: item.tags || []
        })),
        skills: [], // Skills are in separate section
        confidence: 0.9
      };
    });

    // Build skills list from skills section
    const skills = (skillsSection?.objects || []).flatMap(obj =>
      obj.items.map(item => ({
        id: item.id,
        name: item.content,
        tags: item.tags || []
      }))
    );

    // Build education list
    const education = (educationSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        degree: meta.degree || '',
        institution: meta.institution || '',
        location: meta.location || null,
        dateRange: {
          start: meta.startDate || '',
          end: meta.endDate || ''
        },
        tags: obj.tags || []
      };
    });

    // Build certifications list
    const certifications = (certificationsSection?.objects || []).map(obj => {
      const meta = obj.metadata as any;
      return {
        id: obj.id,
        name: meta.name || '',
        issuer: meta.issuer || '',
        dateIssued: meta.issueDate || '',
        expirationDate: meta.expirationDate || null,
        tags: obj.tags || []
      };
    });

    parsedResumeData = {
      jobEntries,
      skills,
      education,
      certifications,
      warnings: parseResult.warnings,
      confidence: {
        overall: parseResult.confidence,
        bySection: new Map<string, number>()
      }
    } as ParsedResume;

    console.log(`Parsed ${jobEntries.length} job entries, ${skills.length} skills into vault ${currentVaultId}`);

    // 4. Navigate to review page and wait for it to fully load
    if (mainWindow) {
      const loadPromise = waitForPageLoad(mainWindow);
      mainWindow.loadFile(path.join(__dirname, '../renderer/review.html'));
      await loadPromise;
    }

    return {
      success: true,
      summary: {
        jobEntries: jobEntries.length,
        skills: skills.length,
        education: education.length,
        certifications: certifications.length,
        confidence: parseResult.confidence
      }
    };
  } catch (error) {
    console.error('Resume processing error:', error);
    throw error;
  }
});

ipcMain.handle('get-parsed-data', async () => {
  console.log('get-parsed-data called, parsedResumeData exists:', !!parsedResumeData);
  if (parsedResumeData) {
    console.log('  jobEntries:', parsedResumeData.jobEntries?.length);
    console.log('  skills:', parsedResumeData.skills?.length);
  }
  return parsedResumeData;
});

ipcMain.handle('save-parsed-content', async (event, data: ParsedResume) => {
  try {
    console.log('Saving parsed content to vault...');

    // The vault was already created during process-resume
    // Now we sync any modifications made during review
    if (!currentVaultId) {
      throw new Error('No vault exists. Please process a resume first.');
    }

    const vault = await vaultManager.getVault(currentVaultId);
    if (!vault) {
      throw new Error(`Vault not found: ${currentVaultId}`);
    }

    // Update experience section with modified job entries
    const experienceSection = vault.sections.find(s => s.type === 'experience');
    if (experienceSection) {
      for (const job of data.jobEntries) {
        const existingObj = experienceSection.objects.find(o => o.id === job.id);
        if (existingObj) {
          // Update job metadata
          await vaultManager.updateObject(currentVaultId, existingObj.id, {
            metadata: {
              ...(existingObj.metadata as any),
              title: job.title,
              company: job.company,
              location: job.location,
              startDate: job.duration?.start,
              endDate: job.duration?.end
            }
          });

          // Update accomplishments - delete removed, update existing, add new
          const existingItemIds = new Set(existingObj.items.map(i => i.id));
          const newItemIds = new Set((job.accomplishments || []).map(a => a.id));

          // Delete removed items
          for (const item of existingObj.items) {
            if (!newItemIds.has(item.id)) {
              await vaultManager.deleteItem(currentVaultId, item.id);
            }
          }

          // Update existing or add new items
          for (let index = 0; index < (job.accomplishments || []).length; index++) {
            const acc = job.accomplishments[index];
            if (existingItemIds.has(acc.id)) {
              // Update existing
              await vaultManager.updateItem(currentVaultId, acc.id, {
                content: acc.description,
                displayOrder: index,
                tags: acc.tags
              });
            } else {
              // Add new
              await vaultManager.addItem(currentVaultId, existingObj.id, {
                objectId: existingObj.id,
                content: acc.description,
                displayOrder: index,
                tags: acc.tags
              });
            }
          }
        }
      }
    }

    // Update skills section
    const skillsSection = vault.sections.find(s => s.type === 'skills');
    if (skillsSection && skillsSection.objects.length > 0) {
      const skillsObj = skillsSection.objects[0];
      const existingSkillIds = new Set(skillsObj.items.map(i => i.id));
      const newSkillIds = new Set((data.skills || []).map(s => s.id));

      // Delete removed skills
      for (const item of skillsObj.items) {
        if (!newSkillIds.has(item.id)) {
          await vaultManager.deleteItem(currentVaultId, item.id);
        }
      }

      // Update existing or add new skills
      for (let index = 0; index < (data.skills || []).length; index++) {
        const skill = data.skills[index];
        if (existingSkillIds.has(skill.id)) {
          await vaultManager.updateItem(currentVaultId, skill.id, {
            content: skill.name,
            displayOrder: index,
            tags: skill.tags
          });
        } else {
          await vaultManager.addItem(currentVaultId, skillsObj.id, {
            objectId: skillsObj.id,
            content: skill.name,
            displayOrder: index,
            tags: skill.tags
          });
        }
      }
    }

    // Update stored parsed data
    parsedResumeData = data;

    console.log('Successfully saved all parsed content to vault');
    return { success: true };
  } catch (error) {
    console.error('Save content error:', error);
    throw error;
  }
});

ipcMain.handle('create-manual-content', async (event, formData) => {
  try {
    // Validate required fields
    if (!formData.type || !formData.content) {
      throw new Error('Content type and content text are required');
    }

    // Ensure we have a vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      // Create a new vault if none exists
      vault = await vaultManager.createVault({
        profile: {
          firstName: '',
          lastName: '',
          email: null,
          phone: null,
          location: null,
          links: [],
          headline: null
        }
      });
      currentVaultId = vault.id;
    }

    // Map old content types to section types
    const sectionTypeMap: Record<string, SectionType> = {
      'job_entry': 'experience',
      'accomplishment': 'experience',
      'skill': 'skills',
      'education': 'education',
      'certification': 'certifications'
    };

    const sectionType = sectionTypeMap[formData.type] || 'experience';
    let section = vault.sections.find(s => s.type === sectionType);

    // Create section if it doesn't exist
    if (!section) {
      section = await vaultManager.addSection(vault.id, {
        vaultId: vault.id,
        type: sectionType,
        label: sectionType.charAt(0).toUpperCase() + sectionType.slice(1),
        objects: [],
        displayOrder: vault.sections.length
      });
    }

    // Create the appropriate object or item based on type
    let itemId: string;

    if (formData.type === 'accomplishment' && formData.parentId) {
      // Add as item to existing object
      const newItem = await vaultManager.addItem(vault.id, formData.parentId, {
        objectId: formData.parentId,
        content: formData.content,
        displayOrder: 0,
        tags: formData.tags
      });
      itemId = newItem.id;
    } else {
      // Create as new object in section
      const metadata = buildMetadataForType(formData.type, formData);
      const newObject = await vaultManager.addObject(vault.id, section.id, {
        sectionId: section.id,
        metadata,
        items: [],
        displayOrder: section.objects.length,
        tags: formData.tags
      });
      itemId = newObject.id;

      // If there's content, add it as an item
      if (formData.content && formData.type !== 'skill') {
        await vaultManager.addItem(vault.id, newObject.id, {
          objectId: newObject.id,
          content: formData.content,
          displayOrder: 0,
          tags: formData.tags
        });
      }
    }

    console.log(`Created manual content item: ${itemId}`);
    return { success: true, id: itemId };
  } catch (error) {
    console.error('Create manual content error:', error);
    throw error;
  }
});

ipcMain.handle('search-content', async (event, query) => {
  try {
    // Validate query has at least one criterion
    const hasQuery = !!(
      query.contentType ||
      query.text ||
      (query.tags && query.tags.length > 0) ||
      query.dateRange
    );

    if (!hasQuery) {
      throw new Error('Search query must have at least one filter criterion');
    }

    console.log('Searching content with query:', query);

    // Map old content types to section types for filtering
    const contentTypeToSection: Record<string, SectionType> = {
      'job_entry': 'experience',
      'accomplishment': 'experience',
      'skill': 'skills',
      'education': 'education',
      'certification': 'certifications'
    };

    // Get current vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      // Try to get any existing vault
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
      if (vault) currentVaultId = vault.id;
    }

    if (!vault) {
      return []; // No vault exists yet
    }

    const results: any[] = [];
    const sectionTypes = query.contentType
      ? [contentTypeToSection[query.contentType]]
      : Object.values(contentTypeToSection);

    for (const section of vault.sections) {
      if (!sectionTypes.includes(section.type)) continue;

      for (const obj of section.objects) {
        // Map vault structure back to old flat format for renderer compatibility
        const oldType = Object.entries(contentTypeToSection).find(([, v]) => v === section.type)?.[0] || section.type;

        // For experience objects, return job entries and/or accomplishments based on query
        if (section.type === 'experience') {
          // Add the job entry itself only if searching for job_entry or no specific type
          if (query.contentType === 'job_entry' || !query.contentType) {
            const meta = obj.metadata as any;
            results.push({
              id: obj.id,
              type: 'job_entry',
              content: `${meta.title || ''} at ${meta.company || ''}`,
              tags: obj.tags || [],
              metadata: {
                company: meta.company,
                location: meta.location,
                dateRange: { start: meta.startDate, end: meta.endDate }
              },
              parentId: null,
              createdAt: vault.metadata.createdAt,
              updatedAt: vault.metadata.updatedAt
            });
          }

          // Add accomplishments as separate items only if searching for accomplishments or no specific type
          if (query.contentType === 'accomplishment' || !query.contentType) {
            for (const item of obj.items) {
              results.push({
                id: item.id,
                type: 'accomplishment',
                content: item.content,
                tags: item.tags || [],
                metadata: {},
                parentId: obj.id,
                createdAt: vault.metadata.createdAt,
                updatedAt: vault.metadata.updatedAt
              });
            }
          }
        } else if (section.type === 'skills') {
          // Skills are stored as items within skill group objects
          for (const item of obj.items) {
            results.push({
              id: item.id,
              type: 'skill',
              content: item.content,
              tags: item.tags || [],
              metadata: { category: (obj.metadata as any).category },
              parentId: obj.id,
              createdAt: vault.metadata.createdAt,
              updatedAt: vault.metadata.updatedAt
            });
          }
        } else {
          // Education, certifications, etc.
          const meta = obj.metadata as any;
          results.push({
            id: obj.id,
            type: oldType,
            content: meta.degree || meta.name || meta.title || '',
            tags: obj.tags || [],
            metadata: meta,
            parentId: null,
            createdAt: vault.metadata.createdAt,
            updatedAt: vault.metadata.updatedAt
          });
        }
      }
    }

    // Apply text filter
    let filteredResults = results;
    if (query.text) {
      const searchText = query.text.toLowerCase();
      filteredResults = results.filter(item =>
        item.content.toLowerCase().includes(searchText) ||
        item.tags?.some((t: string) => t.toLowerCase().includes(searchText))
      );
    }

    // Apply tags filter
    if (query.tags && query.tags.length > 0) {
      filteredResults = filteredResults.filter(item =>
        query.tags.some((tag: string) => item.tags?.includes(tag))
      );
    }

    return filteredResults;
  } catch (error) {
    console.error('Search content error:', error);
    throw error;
  }
});

ipcMain.handle('get-content-item', async (event, contentItemId) => {
  try {
    if (!contentItemId) {
      throw new Error('Content item ID is required');
    }

    // Get current vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
    }

    if (!vault) {
      throw new Error(`Content item not found: ${contentItemId}`);
    }

    // Search through vault for the item
    for (const section of vault.sections) {
      for (const obj of section.objects) {
        // Check if it's the object itself
        if (obj.id === contentItemId) {
          const meta = obj.metadata as any;
          const contentTypeMap: Record<string, string> = {
            'experience': 'job_entry',
            'education': 'education',
            'certifications': 'certification',
            'skills': 'skill'
          };
          return {
            id: obj.id,
            type: contentTypeMap[section.type] || section.type,
            content: meta.title || meta.degree || meta.name || '',
            tags: obj.tags || [],
            metadata: meta,
            parentId: null,
            createdAt: vault.metadata.createdAt,
            updatedAt: vault.metadata.updatedAt
          };
        }

        // Check items within the object
        for (const item of obj.items) {
          if (item.id === contentItemId) {
            return {
              id: item.id,
              type: section.type === 'experience' ? 'accomplishment' : 'skill',
              content: item.content,
              tags: item.tags || [],
              metadata: {},
              parentId: obj.id,
              createdAt: vault.metadata.createdAt,
              updatedAt: vault.metadata.updatedAt
            };
          }
        }
      }
    }

    throw new Error(`Content item not found: ${contentItemId}`);
  } catch (error) {
    console.error('Get content item error:', error);
    throw error;
  }
});

ipcMain.handle('update-content-item', async (event, formData) => {
  try {
    // Validate required fields
    if (!formData.id) {
      throw new Error('Content item ID is required');
    }
    if (!formData.type || !formData.content) {
      throw new Error('Content type and content text are required');
    }

    // Get current vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
      if (vault) currentVaultId = vault.id;
    }

    if (!vault) {
      throw new Error(`Content item not found: ${formData.id}`);
    }

    // Search and update
    for (const section of vault.sections) {
      for (const obj of section.objects) {
        // Check if updating an object
        if (obj.id === formData.id) {
          // Update object using vaultManager API
          await vaultManager.updateObject(currentVaultId!, formData.id, {
            metadata: formData.metadata ? { ...obj.metadata, ...formData.metadata } : undefined,
            tags: formData.tags || obj.tags
          });
          console.log(`Updated content item: ${formData.id}`);
          return { success: true, id: formData.id };
        }

        // Check items within the object
        for (const item of obj.items) {
          if (item.id === formData.id) {
            // Update item using vaultManager API
            await vaultManager.updateItem(currentVaultId!, formData.id, {
              content: formData.content,
              tags: formData.tags || item.tags
            });
            console.log(`Updated content item: ${formData.id}`);
            return { success: true, id: formData.id };
          }
        }
      }
    }

    throw new Error(`Content item not found: ${formData.id}`);
  } catch (error) {
    console.error('Update content item error:', error);
    throw error;
  }
});

ipcMain.handle('delete-content-item', async (event, contentItemId) => {
  try {
    if (!contentItemId) {
      throw new Error('Content item ID is required');
    }

    // Get current vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
      if (vault) currentVaultId = vault.id;
    }

    if (!vault) {
      throw new Error(`Content item not found: ${contentItemId}`);
    }

    // Search and delete
    for (const section of vault.sections) {
      // Check if deleting an object
      const objToDelete = section.objects.find(o => o.id === contentItemId);
      if (objToDelete) {
        await vaultManager.deleteObject(currentVaultId!, contentItemId);
        console.log(`Deleted content item: ${contentItemId}`);
        return { success: true };
      }

      // Check items within objects
      for (const obj of section.objects) {
        const itemToDelete = obj.items.find(i => i.id === contentItemId);
        if (itemToDelete) {
          await vaultManager.deleteItem(currentVaultId!, contentItemId);
          console.log(`Deleted content item: ${contentItemId}`);
          return { success: true };
        }
      }
    }

    throw new Error(`Content item not found: ${contentItemId}`);
  } catch (error) {
    console.error('Delete content item error:', error);
    throw error;
  }
});

// Clear all vault content (destructive operation)
ipcMain.handle('clear-vault', async (event, confirmation) => {
  try {
    // Safety check - require explicit confirmation
    if (confirmation !== 'delete') {
      return { success: false, error: 'Invalid confirmation' };
    }

    // Count items before clearing
    let totalDeleted = 0;
    const allVaults = await vaultManager.getAllVaults();

    for (const vault of allVaults) {
      for (const section of vault.sections) {
        totalDeleted += section.objects.length;
        for (const obj of section.objects) {
          totalDeleted += obj.items.length;
        }
      }
      // Delete the vault
      await vaultManager.deleteVault(vault.id);
    }

    // Clear the current vault reference
    currentVaultId = null;
    parsedResumeData = null;

    console.log(`Cleared vault: ${totalDeleted} items deleted`);
    return { success: true, deletedCount: totalDeleted };
  } catch (error) {
    console.error('Clear vault error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('select-vault-path', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openDirectory'],
    title: 'Select Obsidian Vault Directory'
  });

  if (!result.canceled && result.filePaths.length > 0) {
    const vaultPath = result.filePaths[0];
    obsidianClient.setVaultRootPath(vaultPath);
    console.log(`Vault path set to: ${vaultPath}`);
    return { success: true, path: vaultPath };
  }

  return { success: false };
});

ipcMain.handle('get-vault-path', async () => {
  return obsidianClient.getVaultRootPath();
});

// Native file dialog for resume selection (bypasses HTML5 file input limitations)
ipcMain.handle('select-resume-file', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [
      { name: 'Resume Files', extensions: ['pdf', 'docx', 'txt'] }
    ],
    title: 'Select Resume File'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  const filePath = result.filePaths[0];
  const fileName = path.basename(filePath);
  const stats = fs.statSync(filePath);

  return {
    success: true,
    path: filePath,
    name: fileName,
    size: stats.size
  };
});

// ============================================================================
// Settings IPC Handlers
// ============================================================================

ipcMain.handle('get-settings', async () => {
  return settingsStore.getMasked();
});

ipcMain.handle('save-settings', async (event, newSettings: {
  llmProvider?: 'anthropic' | 'openai';
  anthropicApiKey?: string;
  openaiApiKey?: string;
  defaultModel?: string;
  // Job Search APIs
  jsearchApiKey?: string;
  adzunaAppId?: string;
  adzunaApiKey?: string;
}) => {
  // Only update keys that are provided and not masked
  const updates: Record<string, any> = {};

  if (newSettings.llmProvider) {
    updates.llmProvider = newSettings.llmProvider;
  }

  // Only update API keys if they're actual new values (not masked placeholders)
  if (newSettings.anthropicApiKey && !newSettings.anthropicApiKey.startsWith('••••')) {
    updates.anthropicApiKey = newSettings.anthropicApiKey;
  }

  if (newSettings.openaiApiKey && !newSettings.openaiApiKey.startsWith('••••')) {
    updates.openaiApiKey = newSettings.openaiApiKey;
  }

  if (newSettings.defaultModel !== undefined) {
    updates.defaultModel = newSettings.defaultModel;
  }

  // Job Search API keys
  if (newSettings.jsearchApiKey && !newSettings.jsearchApiKey.startsWith('••••')) {
    updates.jsearchApiKey = newSettings.jsearchApiKey;
  }

  if (newSettings.adzunaAppId) {
    updates.adzunaAppId = newSettings.adzunaAppId;
  }

  if (newSettings.adzunaApiKey && !newSettings.adzunaApiKey.startsWith('••••')) {
    updates.adzunaApiKey = newSettings.adzunaApiKey;
  }

  settingsStore.set(updates);

  // Note: LLM client will be recreated on next use with new settings

  console.log('Settings updated:', {
    provider: newSettings.llmProvider,
    hasAnthropicKey: !!updates.anthropicApiKey,
    hasOpenaiKey: !!updates.openaiApiKey,
    hasJSearchKey: !!updates.jsearchApiKey,
    hasAdzunaKey: !!updates.adzunaAppId && !!updates.adzunaApiKey
  });

  return { success: true };
});

ipcMain.handle('validate-api-key', async (event, { provider, apiKey }: { provider: 'anthropic' | 'openai'; apiKey: string }) => {
  try {
    // Create a temporary client to test the key
    const { LLMClient } = await import('../shared/llm/client');
    const testClient = new LLMClient({
      apiKey,
      provider,
      model: provider === 'anthropic' ? 'claude-sonnet-4-20250514' : 'gpt-4o'
    });

    // Make a minimal test request
    await testClient.complete({
      messages: [{ role: 'user', content: 'Say "ok"' }],
      maxTokens: 10
    });

    return { valid: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    console.log(`API key validation failed for ${provider}:`, message);
    return { valid: false, error: message };
  }
});

ipcMain.handle('check-api-key-configured', async () => {
  return {
    configured: settingsStore.hasValidKey(),
    provider: settingsStore.getProvider()
  };
});

// ============================================================================
// Job Queue IPC Handlers (Tier 2)
// ============================================================================

ipcMain.handle('job-queue-add', async (event, jobData) => {
  try {
    await jobQueue.initialize();

    // DEBUG: Log incoming data
    console.log('[job-queue-add] Received:', JSON.stringify({
      title: jobData.title,
      descLen: jobData.description?.length,
      reqCount: jobData.requirements?.length,
      respCount: jobData.responsibilities?.length,
      prefCount: jobData.preferredQualifications?.length
    }));

    // Build full description from structured fields if available
    let rawDescription = jobData.description || '';

    if (jobData.requirements?.length || jobData.responsibilities?.length || jobData.preferredQualifications?.length) {
      const parts = [jobData.description || ''];

      if (jobData.requirements?.length) {
        parts.push('', '## Requirements');
        parts.push(...jobData.requirements.map((r: string) => `- ${r}`));
      }

      if (jobData.preferredQualifications?.length) {
        parts.push('', '## Preferred Qualifications');
        parts.push(...jobData.preferredQualifications.map((q: string) => `- ${q}`));
      }

      if (jobData.responsibilities?.length) {
        parts.push('', '## Responsibilities');
        parts.push(...jobData.responsibilities.map((r: string) => `- ${r}`));
      }

      rawDescription = parts.filter(line => line !== '').join('\n');
      console.log('[job-queue-add] Built rawDescription length:', rawDescription.length);
    }

    console.log('[job-queue-add] Final rawDescription length:', rawDescription.length);

    const job = await jobQueue.enqueue({
      sourceUrl: jobData.sourceUrl,
      company: jobData.company,
      title: jobData.title,
      rawDescription,
      priority: jobData.priority || 0
    });

    return { success: true, job };
  } catch (error) {
    console.error('Add job error:', error);
    throw error;
  }
});

ipcMain.handle('job-queue-status', async () => {
  await jobQueue.initialize();
  return jobQueue.getStatus();
});

ipcMain.handle('job-queue-list', async () => {
  await jobQueue.initialize();
  return jobQueue.getQueue();
});

ipcMain.handle('job-queue-remove', async (event, jobId) => {
  await jobQueue.initialize();
  const removed = await jobQueue.removeJob(jobId);
  return { success: removed };
});

ipcMain.handle('job-queue-clear-finished', async () => {
  await jobQueue.initialize();
  const count = await jobQueue.clearFinished();
  return { success: true, removed: count };
});

ipcMain.handle('job-queue-process-next', async () => {
  // Check API key first to fail fast with clear error
  if (!settingsStore.hasValidKey()) {
    return {
      success: false,
      error: 'API key not configured. Please set your API key in Settings.'
    };
  }

  await jobQueue.initialize();
  const job = await jobQueue.dequeue();

  if (!job) {
    return { success: false, message: 'No pending jobs in queue' };
  }

  try {
    // Process through ATS optimization system
    console.log(`Processing job: ${job.title} at ${job.company}`);
    const result = await queueProcessor.processJob(job, 'electron-user');

    // Mark job as completed with results
    await jobQueue.completeJob(job.id, result);

    // Update Opus agent memory with insights
    await opusAgent.initialize();
    await opusAgent.afterOptimization(job, result);

    console.log(`Completed job ${job.id} with score: ${result.finalScore.toFixed(2)}`);

    return {
      success: true,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        status: 'completed'
      },
      result: {
        finalScore: result.finalScore,
        matchedSkills: result.matchedSkills.length,
        gaps: result.gaps.length,
        recommendations: result.recommendations.length
      }
    };
  } catch (error) {
    console.error(`Failed to process job ${job.id}:`, error);

    // Mark job as failed (may retry depending on retry count)
    await jobQueue.failJob(job.id, (error as Error).message);

    return {
      success: false,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        status: 'failed'
      },
      error: (error as Error).message
    };
  }
});

ipcMain.handle('job-queue-process-all', async () => {
  // Check API key first to fail fast with clear error
  if (!settingsStore.hasValidKey()) {
    return {
      success: false,
      error: 'API key not configured. Please set your API key in Settings.',
      results: [],
      summary: { processed: 0, succeeded: 0, failed: 0 }
    };
  }

  await jobQueue.initialize();
  const results: Array<{
    jobId: string;
    title: string;
    company: string;
    success: boolean;
    score?: number;
    error?: string;
  }> = [];

  let processed = 0;
  const initialStatus = jobQueue.getStatus();
  const totalPending = initialStatus.pendingJobs;

  if (totalPending === 0) {
    return {
      success: true,
      message: 'No pending jobs to process',
      results: [],
      summary: { processed: 0, succeeded: 0, failed: 0 }
    };
  }

  console.log(`Starting batch processing of ${totalPending} jobs`);

  while (true) {
    const status = jobQueue.getStatus();
    if (status.pendingJobs === 0) break;

    const job = await jobQueue.dequeue();
    if (!job) break;

    try {
      console.log(`[${processed + 1}/${totalPending}] Processing: ${job.title} at ${job.company}`);
      const result = await queueProcessor.processJob(job, 'electron-user');

      await jobQueue.completeJob(job.id, result);
      await opusAgent.initialize();
      await opusAgent.afterOptimization(job, result);

      results.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        success: true,
        score: result.finalScore
      });

      console.log(`  Score: ${result.finalScore.toFixed(2)}`);
    } catch (error) {
      console.error(`  Failed: ${(error as Error).message}`);
      await jobQueue.failJob(job.id, (error as Error).message);

      results.push({
        jobId: job.id,
        title: job.title,
        company: job.company,
        success: false,
        error: (error as Error).message
      });
    }

    processed++;

    // Emit progress event to renderer
    if (mainWindow) {
      mainWindow.webContents.send('queue-progress', {
        processed,
        total: totalPending,
        remaining: jobQueue.getStatus().pendingJobs,
        current: job ? { title: job.title, company: job.company } : null
      });
    }
  }

  const succeeded = results.filter(r => r.success).length;
  const failed = results.filter(r => !r.success).length;

  console.log(`Batch processing complete: ${succeeded} succeeded, ${failed} failed`);

  return {
    success: true,
    results,
    summary: {
      processed,
      succeeded,
      failed,
      averageScore: succeeded > 0
        ? results.filter(r => r.success && r.score).reduce((sum, r) => sum + (r.score || 0), 0) / succeeded
        : 0
    }
  };
});

ipcMain.handle('job-queue-get-result', async (event, jobId) => {
  await jobQueue.initialize();
  const job = jobQueue.getJob(jobId);

  if (!job) {
    return { success: false, error: 'Job not found' };
  }

  return {
    success: true,
    job: {
      id: job.id,
      title: job.title,
      company: job.company,
      status: job.status,
      addedAt: job.addedAt.toISOString(),
      processedAt: job.processedAt?.toISOString()
    },
    result: job.result ? {
      finalScore: job.result.finalScore,
      matchedSkills: job.result.matchedSkills,
      missingSkills: job.result.missingSkills,
      gaps: job.result.gaps,
      recommendations: job.result.recommendations
    } : null,
    error: job.error
  };
});

// ============================================================================
// CSV Import IPC Handlers (Tier 2)
// ============================================================================

ipcMain.handle('import-csv-select', async () => {
  const result = await dialog.showOpenDialog(mainWindow!, {
    properties: ['openFile'],
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
    title: 'Select Job Postings CSV'
  });

  if (result.canceled || result.filePaths.length === 0) {
    return { success: false, canceled: true };
  }

  return { success: true, path: result.filePaths[0] };
});

ipcMain.handle('import-csv-validate', async (event, filePath) => {
  try {
    const validation = await csvImporter.validateCSV(filePath);
    return validation;
  } catch (error) {
    return {
      valid: false,
      errors: [(error as Error).message],
      rowCount: 0
    };
  }
});

ipcMain.handle('import-csv-import', async (event, filePath) => {
  try {
    await jobQueue.initialize();
    const result = await csvImporter.importJobPostings(filePath);
    return result;
  } catch (error) {
    console.error('CSV import error:', error);
    throw error;
  }
});

ipcMain.handle('import-csv-template', async () => {
  const template = csvImporter.constructor.prototype.constructor.generateTemplate
    ? (csvImporter.constructor as any).generateTemplate()
    : 'url,company,title,description,priority\n';

  const result = await dialog.showSaveDialog(mainWindow!, {
    defaultPath: 'job-postings-template.csv',
    filters: [{ name: 'CSV Files', extensions: ['csv'] }]
  });

  if (result.canceled || !result.filePath) {
    return { success: false, canceled: true };
  }

  fs.writeFileSync(result.filePath, template);
  return { success: true, path: result.filePath };
});

// ============================================================================
// Opus Agent IPC Handlers (Tier 3)
// ============================================================================

ipcMain.handle('agent-chat', async (event, message) => {
  console.log('[IPC] agent-chat called with message:', message?.substring?.(0, 50) || message);
  try {
    console.log('[IPC] Initializing opus agent...');
    await opusAgent.initialize();
    console.log('[IPC] Calling opus agent chat...');
    const response = await opusAgent.chat(message);
    console.log('[IPC] Got response from opus agent, length:', response?.message?.length);
    return response;
  } catch (error) {
    console.error('[IPC] Agent chat error:', error);
    return {
      message: `Error: ${(error as Error).message}`,
      confidence: 0
    };
  }
});

ipcMain.handle('agent-get-preferences', async (event, type) => {
  await opusAgent.initialize();
  return opusAgent.getPreferences(type);
});

ipcMain.handle('agent-learn-preference', async (event, preference) => {
  try {
    await opusAgent.initialize();
    await opusAgent.learnPreference({
      ...preference,
      id: preference.id || `pref-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      createdAt: new Date(),
      updatedAt: new Date()
    });
    return { success: true };
  } catch (error) {
    console.error('Learn preference error:', error);
    throw error;
  }
});

// Add inferred skill to vault
ipcMain.handle('agent-infer-skill', async (event, { skill, source, proficiency }) => {
  try {
    // Ensure we have a vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
      if (vault) currentVaultId = vault.id;
    }
    if (!vault) {
      // Create a new vault if none exists
      vault = await vaultManager.createVault({
        profile: {
          firstName: '',
          lastName: '',
          email: null,
          phone: null,
          location: null,
          links: [],
          headline: null
        }
      });
      currentVaultId = vault.id;
    }

    // Find or create skills section
    let skillsSection = vault.sections.find(s => s.type === 'skills');
    if (!skillsSection) {
      skillsSection = await vaultManager.addSection(vault.id, {
        vaultId: vault.id,
        type: 'skills',
        label: 'Skills',
        objects: [],
        displayOrder: vault.sections.length
      });
    }

    // Find or create a skill group for inferred skills
    let inferredGroup = skillsSection.objects.find(o =>
      (o.metadata as any).category === 'Inferred'
    );
    if (!inferredGroup) {
      inferredGroup = await vaultManager.addObject(vault.id, skillsSection.id, {
        sectionId: skillsSection.id,
        metadata: {
          type: 'skills-group',
          category: 'Inferred'
        },
        items: [],
        displayOrder: skillsSection.objects.length,
        tags: ['inferred']
      });
    }

    // Add the skill as an item
    const newItem = await vaultManager.addItem(vault.id, inferredGroup.id, {
      objectId: inferredGroup.id,
      content: skill,
      displayOrder: inferredGroup.items.length,
      tags: ['inferred', 'from-chat']
    });

    // Also learn it as a preference
    await opusAgent.initialize();
    await opusAgent.learnPreference({
      id: `skill-${Date.now()}-${Math.random().toString(36).substring(2, 8)}`,
      type: 'skill',
      value: skill,
      sentiment: 'positive',
      weight: 0.7,
      learnedFrom: 'implicit',
      createdAt: new Date(),
      updatedAt: new Date(),
      confidence: 0.8
    });

    return { success: true, contentId: newItem.id };
  } catch (error) {
    console.error('Skill inference error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Get extended agent context (for display in chat sidebar)
ipcMain.handle('agent-get-context', async (event) => {
  try {
    await opusAgent.initialize();
    const context = await opusAgent.getExtendedContext();
    const preferences = opusAgent.getPreferences();

    return {
      success: true,
      context,
      preferences,
      stats: {
        preferencesCount: preferences.length,
        companiesApplied: preferences.filter(p => p.type === 'company' && p.sentiment === 'negative').length
      }
    };
  } catch (error) {
    console.error('Get context error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Search companies from local data (vault, queue, preferences)
ipcMain.handle('agent-search-companies', async (event, criteria) => {
  try {
    await opusAgent.initialize();
    const result = await opusAgent.searchCompanies(criteria || {});
    return {
      success: true,
      companies: result.companies,
      stats: result.stats
    };
  } catch (error) {
    console.error('Company search error:', error);
    return {
      success: false,
      error: (error as Error).message,
      companies: [],
      stats: {
        totalCompanies: 0,
        appliedCount: 0,
        interestedCount: 0,
        excludedCount: 0,
        topLocations: [],
        topIndustries: []
      }
    };
  }
});

// ============================================================================
// Job Search Agent IPC Handlers (Tier 4)
// ============================================================================

ipcMain.handle('search-jobs', async (event, criteria) => {
  try {
    const results = await jobSearchAgent.searchJobs(criteria);
    return { success: true, results };
  } catch (error) {
    console.error('Job search error:', error);
    // Return structured error response instead of throwing
    return {
      success: false,
      error: (error as Error).message,
      results: []
    };
  }
});

// Find Chrome/Chromium executable path
function findChromePath(): string | null {
  const paths = [
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    '/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium',
    '/usr/bin/chromium-browser',
    // Windows
    'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe',
    'C:\\Program Files (x86)\\Google\\Chrome\\Application\\chrome.exe',
  ];

  for (const chromePath of paths) {
    if (fs.existsSync(chromePath)) {
      return chromePath;
    }
  }
  return null;
}

// Helper function for browser-based fetch using Playwright
async function fetchWithBrowser(url: string): Promise<{ success: boolean; content?: string; error?: string }> {
  console.log('[PlaywrightFetch] Fetching URL:', url);

  const chromePath = findChromePath();
  if (!chromePath) {
    console.error('[PlaywrightFetch] No Chrome/Chromium found on system');
    return { success: false, error: 'No Chrome or Chromium browser found. Please install Chrome.' };
  }

  console.log('[PlaywrightFetch] Using browser:', chromePath);

  let browser: Browser | null = null;

  try {
    // Launch browser - use new headless mode that's harder for WAF to detect
    browser = await chromium.launch({
      executablePath: chromePath,
      headless: false, // Use headed mode - WAF can't detect it
      args: [
        '--disable-blink-features=AutomationControlled',
        '--disable-features=IsolateOrigins,site-per-process',
        '--disable-infobars',
        '--window-position=-2400,-2400' // Move window off-screen so user doesn't see it
      ]
    });

    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 800 }
    });

    const page = await context.newPage();

    // Navigate to the URL - use 'domcontentloaded' instead of 'networkidle'
    // because some sites (IBM Careers) have continuous network activity
    console.log('[PlaywrightFetch] Navigating to page...');
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });

    // Wait for JS to render content - this is critical for dynamic sites
    console.log('[PlaywrightFetch] Waiting for JS to render...');
    await page.waitForTimeout(5000);

    // Check for WAF/bot challenge pages and wait for resolution
    // Covers: AWS WAF, Cloudflare, and other common challenge pages
    const isChallengePage = (html: string, title: string): boolean => {
      return html.includes('awsWafCookieDomainList') ||
             html.includes('cf-browser-verification') ||
             html.includes('challenge-running') ||
             html.includes('Verifying you are human') ||
             title.includes('Just a moment');
    };

    let html = await page.content();
    let title = await page.title();

    if (isChallengePage(html, title)) {
      console.log('[PlaywrightFetch] Challenge page detected, waiting for resolution...');
      // Wait longer and check periodically for the real page to load
      for (let i = 0; i < 6; i++) {
        await page.waitForTimeout(3000);
        html = await page.content();
        title = await page.title();
        if (!isChallengePage(html, title)) {
          console.log('[PlaywrightFetch] Challenge resolved');
          break;
        }
        console.log(`[PlaywrightFetch] Still waiting for challenge... attempt ${i + 1}/6`);
      }
    }

    // First try JSON-LD structured data - most job sites have this for SEO
    // It contains the full job description without "Read more" truncation
    const jsonLdData = await page.evaluate(`() => {
      const scripts = document.querySelectorAll('script[type="application/ld+json"]');
      for (const script of scripts) {
        try {
          const data = JSON.parse(script.textContent || '');
          if (data['@type'] === 'JobPosting' || (Array.isArray(data) && data.some(d => d['@type'] === 'JobPosting'))) {
            return script.textContent;
          }
        } catch {}
      }
      return null;
    }`) as string | null;

    if (jsonLdData) {
      console.log('[PlaywrightFetch] Found JSON-LD JobPosting data');
      try {
        const parsed = JSON.parse(jsonLdData);
        const job = Array.isArray(parsed) ? parsed.find(d => d['@type'] === 'JobPosting') : parsed;
        if (job?.description) {
          // Strip HTML from description and return structured content
          const cleanDesc = job.description.replace(/<[^>]*>/g, ' ').replace(/&#\d+;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim();
          const structuredContent = [
            `Title: ${job.title || ''}`,
            `Company: ${job.hiringOrganization?.name || ''}`,
            `Location: ${job.jobLocation?.address?.addressLocality || ''}, ${job.jobLocation?.address?.addressRegion || ''}`,
            ``,
            `Description:`,
            cleanDesc,
            ``,
            job.qualifications ? `Qualifications: ${job.qualifications}` : '',
            job.responsibilities ? `Responsibilities: ${job.responsibilities}` : ''
          ].filter(Boolean).join('\n');

          console.log(`[PlaywrightFetch] Extracted ${structuredContent.length} chars from JSON-LD`);
          return { success: true, content: structuredContent };
        }
      } catch (e) {
        console.warn('[PlaywrightFetch] Failed to parse JSON-LD:', e);
      }
    }

    // Fallback: Get the rendered text content
    const textContent = await page.evaluate('() => document.body?.innerText || ""') as string;

    if (!textContent || textContent.length === 0) {
      console.warn('[PlaywrightFetch] No text content extracted');
      return { success: false, error: 'Page did not render content - may be blocked by WAF' };
    }

    console.log(`[PlaywrightFetch] Fetched ${textContent.length} chars from innerText`);

    if (textContent.length < 200) {
      console.warn('[PlaywrightFetch] Very little content extracted');
      return { success: false, error: 'Page content did not load - may require login or manual verification' };
    }

    return { success: true, content: textContent };

  } catch (error) {
    console.error('[PlaywrightFetch] Error:', error);
    return { success: false, error: (error as Error).message };
  } finally {
    if (browser) {
      await browser.close();
    }
  }
}

ipcMain.handle('extract-job-from-url', async (event, url, content) => {
  console.log('[JobExtract] Extracting:', url);
  try {
    // First attempt: try with provided content or let agent fetch
    let extracted = await jobSearchAgent.extractJobFromUrl(url, content);

    // If extraction failed and no content was provided, try browser-based fetch
    // This handles WAF-protected sites like Workday, Greenhouse, etc.
    if (!extracted && !content) {
      console.log('[JobExtract] Simple fetch failed, trying browser...');
      const browserResult = await fetchWithBrowser(url);

      if (browserResult.success && browserResult.content) {
        extracted = await jobSearchAgent.extractJobFromUrl(url, browserResult.content);
      } else {
        console.warn('[JobExtract] Browser fetch failed:', browserResult.error);
      }
    }

    if (!extracted) {
      return { success: false, message: 'Could not extract job details. The site may require login or have bot protection.' };
    }

    console.log('[JobExtract] Success:', extracted.title, 'at', extracted.company);
    return { success: true, job: extracted };
  } catch (error) {
    console.error('[JobExtract] Error:', error);
    return {
      success: false,
      message: `Error extracting job: ${(error as Error).message}`,
      job: null
    };
  }
});

ipcMain.handle('search-agent-config', async (event, config) => {
  if (config) {
    jobSearchAgent.updateConfig(config);
  }
  return jobSearchAgent.getConfig();
});

// ============================================================================
// ATS Optimizer IPC Handlers
// ============================================================================

import { optimizeResume as holisticOptimize, analyzeOnly } from '../ats-agent/holistic/orchestrator';
import { LLMClient } from '../shared/llm/client';
import type { JobPosting, Resume } from '../ats-agent/types';

// Get resume content from vault for optimizer preview
ipcMain.handle('optimizer-get-resume-preview', async () => {
  try {
    // Get current vault or first available vault
    let vault: Vault | null = null;
    if (currentVaultId) {
      vault = await vaultManager.getVault(currentVaultId);
    }
    if (!vault) {
      const allVaults = await vaultManager.getAllVaults();
      vault = allVaults[0] || null;
      if (vault) currentVaultId = vault.id;
    }

    if (!vault) {
      return {
        success: false,
        error: 'No resume content found in vault. Please upload a resume first.'
      };
    }

    const contentParts: string[] = [];
    let jobCount = 0;
    let accomplishmentCount = 0;
    let skillCount = 0;
    let educationCount = 0;
    let certificationCount = 0;

    // Process experience section
    const experienceSection = vault.sections.find(s => s.type === 'experience');
    if (experienceSection) {
      for (const obj of experienceSection.objects) {
        const meta = obj.metadata as any;
        const jobContent: string[] = [];
        jobContent.push(`## ${meta.title || ''} at ${meta.company || ''}`);

        if (meta.location) {
          const loc = meta.location;
          if (typeof loc === 'string') {
            jobContent.push(`Location: ${loc}`);
          } else if (typeof loc === 'object' && loc !== null) {
            const parts: string[] = [];
            if (loc.city) parts.push(loc.city);
            if (loc.state) parts.push(loc.state);
            if (loc.country) parts.push(loc.country);
            if (parts.length > 0) {
              jobContent.push(`Location: ${parts.join(', ')}`);
            }
          }
        }
        if (meta.startDate) {
          jobContent.push(`Duration: ${meta.startDate} - ${meta.endDate || 'Present'}`);
        }

        // Add accomplishments from items
        if (obj.items.length > 0) {
          jobContent.push('');
          for (const item of obj.items) {
            jobContent.push(`- ${item.content}`);
            accomplishmentCount++;
          }
        }

        contentParts.push(jobContent.join('\n'));
        jobCount++;
      }
    }

    // Process skills section
    const skillsSection = vault.sections.find(s => s.type === 'skills');
    if (skillsSection) {
      const skillNames: string[] = [];
      for (const obj of skillsSection.objects) {
        for (const item of obj.items) {
          if (item.content?.trim()) {
            skillNames.push(item.content.trim());
            skillCount++;
          }
        }
      }
      if (skillNames.length > 0) {
        contentParts.push('\n## Skills');
        contentParts.push(skillNames.join(', '));
      }
    }

    // Process education section
    const educationSection = vault.sections.find(s => s.type === 'education');
    if (educationSection) {
      const eduItems: string[] = [];
      for (const obj of educationSection.objects) {
        const meta = obj.metadata as any;
        eduItems.push(`- ${meta.degree || ''} from ${meta.institution || ''}`);
        educationCount++;
      }
      if (eduItems.length > 0) {
        contentParts.push('\n## Education');
        contentParts.push(...eduItems);
      }
    }

    // Process certifications section
    const certificationsSection = vault.sections.find(s => s.type === 'certifications');
    if (certificationsSection) {
      const certItems: string[] = [];
      for (const obj of certificationsSection.objects) {
        const meta = obj.metadata as any;
        certItems.push(`- ${meta.name || ''} by ${meta.issuer || ''}`);
        certificationCount++;
      }
      if (certItems.length > 0) {
        contentParts.push('\n## Certifications');
        contentParts.push(...certItems);
      }
    }

    const content = contentParts.join('\n\n');

    if (!content.trim()) {
      return {
        success: false,
        error: 'No resume content found in vault. Please upload a resume first.'
      };
    }

    return {
      success: true,
      content,
      metadata: {
        jobEntries: jobCount,
        accomplishments: accomplishmentCount,
        skills: skillCount,
        education: educationCount,
        certifications: certificationCount
      }
    };
  } catch (error) {
    console.error('Get resume preview error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
});

// Run full optimization loop
ipcMain.handle('optimizer-optimize', async (event, { jobPosting, resume }) => {
  try {
    console.log('Starting ATS optimization...');
    console.log(`Job: ${jobPosting.title} at ${jobPosting.company || 'Company'}`);

    // Check for API key in settings store (same as process-resume)
    if (!settingsStore.hasValidKey()) {
      return {
        success: false,
        error: 'API key not configured. Please configure your API key in Settings before using the optimizer.'
      };
    }

    // Build LLM config - only include model if explicitly set
    const llmConfig: { apiKey: string; provider: 'anthropic' | 'openai'; model?: string } = {
      apiKey: settingsStore.getApiKey(),
      provider: settingsStore.getProvider()
    };
    const defaultModel = settingsStore.getDefaultModel();
    if (defaultModel) {
      llmConfig.model = defaultModel;
    }
    const llmClient = new LLMClient(llmConfig);

    // Send initial progress
    if (mainWindow) {
      mainWindow.webContents.send('optimizer-progress', {
        percent: 10,
        stage: 'Analyzing job posting and resume...',
        round: 1,
        totalRounds: settingsStore.getMaxIterations()
      });
    }

    // Run holistic optimization
    const maxIterations = settingsStore.getMaxIterations();
    const result = await holisticOptimize(
      jobPosting as JobPosting,
      resume as Resume,
      llmClient,
      {
        targetFit: 0.8,
        maxIterations,
        minImprovement: 0.05
      }
    );

    // Send completion progress
    if (mainWindow) {
      mainWindow.webContents.send('optimizer-progress', {
        percent: 100,
        stage: 'Optimization complete!',
        round: result.iterations.length,
        totalRounds: maxIterations
      });
    }

    console.log(`Optimization complete: ${result.initialFit.toFixed(2)} → ${result.finalFit.toFixed(2)}`);

    return {
      success: true,
      data: result
    };
  } catch (error) {
    console.error('Optimization error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
});

// Extract content from uploaded file
ipcMain.handle('optimizer-extract-file', async (event, { path: filePath, name }) => {
  try {
    const format = getFileFormat(name);
    if (!format) {
      return {
        success: false,
        error: `Unsupported file format: ${name}`
      };
    }

    const extractionResult = await fileExtractor.extractText(filePath, format);

    if (!extractionResult.text || extractionResult.text.trim().length === 0) {
      return {
        success: false,
        error: 'No text content extracted from file'
      };
    }

    return {
      success: true,
      content: extractionResult.text
    };
  } catch (error) {
    console.error('File extraction error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
});

// Export optimized resume
ipcMain.handle('optimizer-export', async (event, { content, format, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename || `optimized-resume.${format === 'markdown' ? 'md' : 'txt'}`,
      filters: [
        { name: 'Markdown', extensions: ['md'] },
        { name: 'Text', extensions: ['txt'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    fs.writeFileSync(result.filePath, content, 'utf-8');
    console.log(`Exported optimized resume to: ${result.filePath}`);

    return {
      success: true,
      path: result.filePath
    };
  } catch (error) {
    console.error('Export error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
});

// Export optimized resume as PDF
ipcMain.handle('optimizer-export-pdf', async (event, { content, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename || 'optimized-resume.pdf',
      filters: [
        { name: 'PDF', extensions: ['pdf'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Create PDF document
    const doc = new PDFDocument({
      margin: 50,
      size: 'LETTER'
    });

    const writeStream = fs.createWriteStream(result.filePath);
    doc.pipe(writeStream);

    // Parse markdown content and render to PDF
    const lines = content.split('\n');

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // H1 heading
        doc.fontSize(24).font('Helvetica-Bold').text(line.substring(2), { continued: false });
        doc.moveDown(0.5);
      } else if (line.startsWith('## ')) {
        // H2 heading
        doc.fontSize(18).font('Helvetica-Bold').text(line.substring(3), { continued: false });
        doc.moveDown(0.3);
      } else if (line.startsWith('### ')) {
        // H3 heading
        doc.fontSize(14).font('Helvetica-Bold').text(line.substring(4), { continued: false });
        doc.moveDown(0.2);
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Bullet point
        doc.fontSize(11).font('Helvetica').text('• ' + line.substring(2), { indent: 20 });
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold text
        doc.fontSize(11).font('Helvetica-Bold').text(line.slice(2, -2));
      } else if (line.trim() === '') {
        // Empty line
        doc.moveDown(0.5);
      } else {
        // Regular text
        doc.fontSize(11).font('Helvetica').text(line);
      }
    }

    doc.end();

    // Wait for the write stream to finish
    await new Promise<void>((resolve, reject) => {
      writeStream.on('finish', resolve);
      writeStream.on('error', reject);
    });

    console.log(`Exported PDF to: ${result.filePath}`);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('PDF export error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Export optimized resume as Word document
ipcMain.handle('optimizer-export-word', async (event, { content, filename }) => {
  try {
    const result = await dialog.showSaveDialog(mainWindow!, {
      defaultPath: filename || 'optimized-resume.docx',
      filters: [
        { name: 'Word Document', extensions: ['docx'] }
      ]
    });

    if (result.canceled || !result.filePath) {
      return { success: false, canceled: true };
    }

    // Parse markdown content into docx paragraphs
    const lines = content.split('\n');
    const children: Paragraph[] = [];

    for (const line of lines) {
      if (line.startsWith('# ')) {
        // H1 heading
        children.push(new Paragraph({
          text: line.substring(2),
          heading: HeadingLevel.HEADING_1,
          spacing: { after: 200 }
        }));
      } else if (line.startsWith('## ')) {
        // H2 heading
        children.push(new Paragraph({
          text: line.substring(3),
          heading: HeadingLevel.HEADING_2,
          spacing: { after: 150 }
        }));
      } else if (line.startsWith('### ')) {
        // H3 heading
        children.push(new Paragraph({
          text: line.substring(4),
          heading: HeadingLevel.HEADING_3,
          spacing: { after: 100 }
        }));
      } else if (line.startsWith('- ') || line.startsWith('* ')) {
        // Bullet point
        children.push(new Paragraph({
          children: [new TextRun(line.substring(2))],
          bullet: { level: 0 },
          spacing: { after: 50 }
        }));
      } else if (line.startsWith('**') && line.endsWith('**')) {
        // Bold text
        children.push(new Paragraph({
          children: [new TextRun({ text: line.slice(2, -2), bold: true })],
          spacing: { after: 50 }
        }));
      } else if (line.trim() === '') {
        // Empty line - add spacing
        children.push(new Paragraph({ text: '', spacing: { after: 100 } }));
      } else {
        // Regular text
        children.push(new Paragraph({
          children: [new TextRun(line)],
          spacing: { after: 50 }
        }));
      }
    }

    const doc = new Document({
      sections: [{
        properties: {},
        children
      }]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(result.filePath, buffer);

    console.log(`Exported Word document to: ${result.filePath}`);
    return { success: true, path: result.filePath };
  } catch (error) {
    console.error('Word export error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Get optimization result for display on results page
ipcMain.handle('get-optimization-result', async (event, jobId: string) => {
  try {
    await jobQueue.initialize();
    const job = jobQueue.getJob(jobId);

    if (!job) {
      return { success: false, error: 'Job not found' };
    }

    if (!job.result) {
      return { success: false, error: 'No optimization result available for this job' };
    }

    return {
      success: true,
      job: {
        id: job.id,
        title: job.title,
        company: job.company,
        status: job.status,
        addedAt: job.addedAt.toISOString(),
        processedAt: job.processedAt?.toISOString()
      },
      result: {
        finalScore: job.result.finalScore,
        previousScore: job.result.previousScore,
        matchedSkills: job.result.matchedSkills,
        missingSkills: job.result.missingSkills,
        gaps: job.result.gaps,
        recommendations: job.result.recommendations,
        optimizedContent: job.result.optimizedContent,
        processedAt: job.result.processedAt.toISOString()
      }
    };
  } catch (error) {
    console.error('Get optimization result error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Save optimized resume to vault
ipcMain.handle('optimizer-save-to-vault', async (event, { content, jobTitle, company }) => {
  try {
    const vaultPath = obsidianClient.getVaultRootPath();
    if (!vaultPath) {
      return {
        success: false,
        error: 'No vault path configured. Please select a vault first.'
      };
    }

    // Create filename with job info
    const timestamp = new Date().toISOString().split('T')[0];
    const safeTitle = (jobTitle || 'optimized').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 30);
    const safeCompany = (company || '').replace(/[^a-zA-Z0-9]/g, '-').substring(0, 20);
    const filename = safeCompany
      ? `optimized-resume-${safeCompany}-${safeTitle}-${timestamp}.md`
      : `optimized-resume-${safeTitle}-${timestamp}.md`;

    const fullPath = path.join(vaultPath, 'Resumes', filename);

    // Ensure directory exists
    const dir = path.dirname(fullPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    // Add frontmatter
    const frontmatter = `---
type: optimized-resume
created: ${new Date().toISOString()}
job_title: ${jobTitle || ''}
company: ${company || ''}
---

`;

    fs.writeFileSync(fullPath, frontmatter + content, 'utf-8');
    console.log(`Saved optimized resume to vault: ${fullPath}`);

    return {
      success: true,
      path: fullPath
    };
  } catch (error) {
    console.error('Save to vault error:', error);
    return {
      success: false,
      error: (error as Error).message
    };
  }
});

// ============================================================================
// App State IPC Handlers (State Persistence)
// ============================================================================

ipcMain.handle('app-state-start-workflow', async (event, { type, currentPage, initialData }) => {
  try {
    const workflow = appStateStore.startWorkflow(type, currentPage, initialData || {});
    return { success: true, workflow };
  } catch (error) {
    console.error('Start workflow error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-update-workflow', async (event, updates) => {
  try {
    const workflow = appStateStore.updateWorkflow(updates);
    return { success: true, workflow };
  } catch (error) {
    console.error('Update workflow error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-get-workflow', async () => {
  try {
    const workflow = appStateStore.getWorkflow();
    return { success: true, workflow };
  } catch (error) {
    console.error('Get workflow error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-clear-workflow', async () => {
  try {
    appStateStore.clearWorkflow();
    return { success: true };
  } catch (error) {
    console.error('Clear workflow error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-save-page', async (event, { page, data }) => {
  try {
    const pageState = appStateStore.savePageState(page, data);
    return { success: true, pageState };
  } catch (error) {
    console.error('Save page state error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-get-page', async (event, page) => {
  try {
    const pageState = appStateStore.getPageState(page);
    return { success: true, pageState };
  } catch (error) {
    console.error('Get page state error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('app-state-get-continue-info', async () => {
  try {
    const info = appStateStore.getContinueInfo();
    return { success: true, ...info };
  } catch (error) {
    console.error('Get continue info error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// ============================================================================
// Applications IPC Handlers (Resume Storage)
// ============================================================================

ipcMain.handle('applications-list', async (event, statusFilter?: ApplicationStatus) => {
  try {
    const applications = applicationsStore.list(statusFilter);
    const stats = applicationsStore.getStats();
    return { success: true, applications, stats };
  } catch (error) {
    console.error('List applications error:', error);
    return { success: false, error: (error as Error).message, applications: [], stats: null };
  }
});

ipcMain.handle('applications-get', async (event, id: string) => {
  try {
    const application = applicationsStore.get(id);
    if (!application) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true, application };
  } catch (error) {
    console.error('Get application error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('applications-save', async (event, data: {
  jobTitle: string;
  company: string;
  jobDescription: string;
  generatedResume: string;
  score: number;
  sourceUrl?: string;
  metadata: {
    iterations: number;
    initialScore: number;
  };
}) => {
  try {
    const application = applicationsStore.save(data);
    if (!application) {
      return { success: false, error: 'Failed to save application. Is the vault configured?' };
    }
    return { success: true, application };
  } catch (error) {
    console.error('Save application error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('applications-update', async (event, { id, updates }: {
  id: string;
  updates: {
    status?: ApplicationStatus;
    notes?: string;
  };
}) => {
  try {
    const application = applicationsStore.update(id, updates);
    if (!application) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true, application };
  } catch (error) {
    console.error('Update application error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('applications-delete', async (event, id: string) => {
  try {
    const deleted = applicationsStore.delete(id);
    if (!deleted) {
      return { success: false, error: 'Application not found' };
    }
    return { success: true };
  } catch (error) {
    console.error('Delete application error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// ============================================================================
// Knowledge Base IPC Handlers
// ============================================================================

ipcMain.handle('knowledge-base-list', async (event, filters?: KnowledgeBaseFilters) => {
  try {
    const entries = knowledgeBaseStore.list(filters);
    return { success: true, entries };
  } catch (error) {
    console.error('List knowledge base error:', error);
    return { success: false, error: (error as Error).message, entries: [] };
  }
});

ipcMain.handle('knowledge-base-get', async (event, id: string) => {
  try {
    const entry = knowledgeBaseStore.get(id);
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }
    return { success: true, entry };
  } catch (error) {
    console.error('Get knowledge base entry error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-save', async (event, data: Omit<KnowledgeBaseEntry, 'id' | 'createdAt'>) => {
  try {
    const entry = knowledgeBaseStore.save(data);
    if (!entry) {
      return { success: false, error: 'Failed to save entry - vault not configured?' };
    }
    return { success: true, entry };
  } catch (error) {
    console.error('Save knowledge base entry error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-update', async (event, { id, updates }: {
  id: string;
  updates: {
    notes?: string;
    tags?: string[];
    optimizedResume?: string;
  };
}) => {
  try {
    const entry = knowledgeBaseStore.update(id, updates);
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }
    return { success: true, entry };
  } catch (error) {
    console.error('Update knowledge base entry error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-delete', async (event, id: string) => {
  try {
    const deleted = knowledgeBaseStore.delete(id);
    if (!deleted) {
      return { success: false, error: 'Entry not found' };
    }
    return { success: true };
  } catch (error) {
    console.error('Delete knowledge base entry error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-stats', async () => {
  try {
    const stats = knowledgeBaseStore.getStats();
    return { success: true, stats };
  } catch (error) {
    console.error('Get knowledge base stats error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-companies', async () => {
  try {
    const companies = knowledgeBaseStore.getCompanies();
    return { success: true, companies };
  } catch (error) {
    console.error('Get knowledge base companies error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-job-titles', async () => {
  try {
    const jobTitles = knowledgeBaseStore.getJobTitles();
    return { success: true, jobTitles };
  } catch (error) {
    console.error('Get knowledge base job titles error:', error);
    return { success: false, error: (error as Error).message };
  }
});

ipcMain.handle('knowledge-base-export', async (event, { id, format }: { id: string; format: 'pdf' | 'docx' | 'md' }) => {
  try {
    const entry = knowledgeBaseStore.get(id);
    if (!entry) {
      return { success: false, error: 'Entry not found' };
    }

    const safeTitle = entry.jobTitle.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    const safeCompany = entry.company.replace(/[^a-zA-Z0-9\s-]/g, '').replace(/\s+/g, '-');
    const defaultFilename = `${safeCompany}-${safeTitle}-resume`;

    if (format === 'md') {
      // Export as markdown
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: `${defaultFilename}.md`,
        filters: [{ name: 'Markdown', extensions: ['md'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      fs.writeFileSync(result.filePath, entry.optimizedResume, 'utf-8');
      return { success: true, path: result.filePath };
    }

    if (format === 'pdf') {
      // Export as PDF (reuse existing PDF logic)
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: `${defaultFilename}.pdf`,
        filters: [{ name: 'PDF', extensions: ['pdf'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const doc = new PDFDocument({ margin: 50, size: 'LETTER' });
      const writeStream = fs.createWriteStream(result.filePath);
      doc.pipe(writeStream);

      const lines = entry.optimizedResume.split('\n');
      for (const line of lines) {
        if (line.startsWith('# ')) {
          doc.fontSize(24).font('Helvetica-Bold').text(line.substring(2));
          doc.moveDown(0.5);
        } else if (line.startsWith('## ')) {
          doc.fontSize(18).font('Helvetica-Bold').text(line.substring(3));
          doc.moveDown(0.3);
        } else if (line.startsWith('### ')) {
          doc.fontSize(14).font('Helvetica-Bold').text(line.substring(4));
          doc.moveDown(0.2);
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          doc.fontSize(11).font('Helvetica').text('• ' + line.substring(2), { indent: 20 });
        } else if (line.startsWith('**') && line.endsWith('**')) {
          doc.fontSize(11).font('Helvetica-Bold').text(line.slice(2, -2));
        } else if (line.trim() === '') {
          doc.moveDown(0.5);
        } else {
          doc.fontSize(11).font('Helvetica').text(line);
        }
      }

      doc.end();
      await new Promise<void>((resolve, reject) => {
        writeStream.on('finish', resolve);
        writeStream.on('error', reject);
      });

      return { success: true, path: result.filePath };
    }

    if (format === 'docx') {
      // Export as Word document (reuse existing Word logic)
      const result = await dialog.showSaveDialog(mainWindow!, {
        defaultPath: `${defaultFilename}.docx`,
        filters: [{ name: 'Word Document', extensions: ['docx'] }]
      });

      if (result.canceled || !result.filePath) {
        return { success: false, canceled: true };
      }

      const lines = entry.optimizedResume.split('\n');
      const children: Paragraph[] = [];

      for (const line of lines) {
        if (line.startsWith('# ')) {
          children.push(new Paragraph({
            text: line.substring(2),
            heading: HeadingLevel.HEADING_1,
            spacing: { after: 200 }
          }));
        } else if (line.startsWith('## ')) {
          children.push(new Paragraph({
            text: line.substring(3),
            heading: HeadingLevel.HEADING_2,
            spacing: { after: 150 }
          }));
        } else if (line.startsWith('### ')) {
          children.push(new Paragraph({
            text: line.substring(4),
            heading: HeadingLevel.HEADING_3,
            spacing: { after: 100 }
          }));
        } else if (line.startsWith('- ') || line.startsWith('* ')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: '• ' + line.substring(2) })],
            indent: { left: 720 }
          }));
        } else if (line.startsWith('**') && line.endsWith('**')) {
          children.push(new Paragraph({
            children: [new TextRun({ text: line.slice(2, -2), bold: true })]
          }));
        } else if (line.trim() === '') {
          children.push(new Paragraph({ text: '' }));
        } else {
          children.push(new Paragraph({ text: line }));
        }
      }

      const doc = new Document({
        sections: [{ children }]
      });

      const buffer = await Packer.toBuffer(doc);
      fs.writeFileSync(result.filePath, buffer);

      return { success: true, path: result.filePath };
    }

    return { success: false, error: 'Unsupported format' };
  } catch (error) {
    console.error('Export knowledge base entry error:', error);
    return { success: false, error: (error as Error).message };
  }
});

// Helper function to extract tags from text
function extractTagsFromText(text: string): string[] {
  const tags: string[] = [];
  const lowerText = text.toLowerCase();

  // Common role keywords
  const roleKeywords = ['engineer', 'developer', 'manager', 'lead', 'senior', 'junior', 'architect', 'analyst'];
  for (const keyword of roleKeywords) {
    if (lowerText.includes(keyword)) {
      tags.push(keyword);
    }
  }

  // Common tech keywords
  const techKeywords = ['software', 'data', 'frontend', 'backend', 'fullstack', 'devops', 'cloud', 'mobile'];
  for (const keyword of techKeywords) {
    if (lowerText.includes(keyword)) {
      tags.push(keyword);
    }
  }

  return tags;
}

app.on('ready', async () => {
  // Initialize settings store early (uses dynamic import for ESM electron-store)
  await settingsStore.initialize();
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow();
  }
});

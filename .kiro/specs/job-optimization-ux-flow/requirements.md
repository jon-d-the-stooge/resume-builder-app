# Requirements Document: Job Optimization UX Flow

## Introduction

This spec redesigns the UX flow for the resume builder app. The core building blocks (job search agent, career coach, committee agents, optimization loop, vault) are solid - the problem is navigation and state management. Currently the app feels like "a house with a door that opens to a wall" - screens that don't connect logically, work that disappears on navigation, and no way to find previously generated resumes.

The vault is the foundation of the app - an empty vault means a useless app. This design prioritizes:
1. Frictionless vault population (upload, manual entry, career agent)
2. Multiple working paths to job input (paste, URL extract, queue)
3. State persistence across navigation
4. A dedicated place for saved resumes and applications

## Requirements

### Requirement 1: Vault-Centric Onboarding

**User Story:** As a new user, I want to quickly populate my vault so I can start using the app's core functionality.

#### Acceptance Criteria

1. WHEN a new user opens the app with an empty vault THEN the system SHALL guide them to add content via one of three methods
2. WHEN the user uploads a resume THEN the system SHALL parse it and populate vault with extracted skills, experience, and accomplishments
3. WHEN the user chooses manual entry THEN the system SHALL provide a simple form to add skills, experience, or accomplishments one at a time
4. WHEN the user engages with the career agent THEN the system SHALL automatically extract and add relevant information to the vault from the conversation
5. IF the vault is empty AND user tries to optimize THEN the system SHALL block with a clear message and link to add vault content

### Requirement 2: Three Working Job Input Methods

**User Story:** As a user, I want multiple ways to input job information, and all of them should actually work.

#### Acceptance Criteria

1. WHEN the user pastes a job description into the text area THEN the system SHALL accept it and enable optimization
2. WHEN the user pastes a URL THEN the system SHALL extract the job posting and display the extracted data for confirmation
3. WHEN the user selects a job from the queue THEN the system SHALL load that job's data into the optimizer
4. WHEN extraction from URL fails THEN the system SHALL show a clear error and offer manual paste as fallback
5. IF extraction returns partial data THEN the system SHALL show what was extracted and allow manual completion of missing fields

### Requirement 3: Career Agent → Job Search → Queue Flow

**User Story:** As a user, I want to ask the career agent to find jobs for me, review them in chat, and add promising ones to my queue.

#### Acceptance Criteria

1. WHEN the career agent searches for jobs THEN the system SHALL display results as clickable cards within the chat interface
2. WHEN a job card is displayed in chat THEN it SHALL have an "Add to Queue" button
3. WHEN the user clicks "Add to Queue" on a chat job card THEN the system SHALL extract full job details (if not already) and add to the queue
4. WHEN a job is added to queue THEN the system SHALL show confirmation without navigating away from chat
5. WHEN the user wants to optimize a queued job THEN the system SHALL provide a clear path from queue to optimizer with one click

### Requirement 4: State Persistence

**User Story:** As a user, I want my work preserved if I navigate away, so I don't lose progress.

#### Acceptance Criteria

1. WHEN the user is on the optimizer page AND navigates away THEN the system SHALL save current state (job data, resume data, any in-progress work)
2. WHEN the user returns to optimizer THEN the system SHALL offer to restore their previous session
3. WHEN the user is mid-optimization AND the app crashes or closes THEN the system SHALL recover state on next launch
4. WHEN the user is in chat with the career agent AND navigates away THEN the system SHALL preserve the conversation
5. WHEN the user is on any form-based screen AND navigates away THEN the system SHALL preserve entered data for at least the current session

### Requirement 5: Saved Resumes & Applications View

**User Story:** As a user, I want a dedicated place to find all my previously generated resumes and the jobs they were optimized for.

#### Acceptance Criteria

1. WHEN optimization completes THEN the system SHALL automatically save the result to a persistent "Applications" or "Saved Resumes" store
2. WHEN the user views the Applications screen THEN the system SHALL display a list of all saved optimizations with: job title, company, date, match score
3. WHEN the user clicks on a saved application THEN the system SHALL show the full details: job description, generated resume, recommendations
4. WHEN viewing a saved application THEN the system SHALL allow export (PDF, DOCX, Markdown)
5. WHEN viewing a saved application THEN the system SHALL allow re-optimization with updated vault content
6. IF the user navigates away from optimizer before explicitly saving THEN the system SHALL still auto-save the result

### Requirement 6: Queue Management

**User Story:** As a user, I want to batch jobs and process them when convenient, without losing track of what's in my queue.

#### Acceptance Criteria

1. WHEN jobs are added to queue (from chat, search, or manual) THEN the system SHALL persist them across sessions
2. WHEN viewing the queue THEN the system SHALL show job title, company, date added, and status (pending/processing/completed/failed)
3. WHEN the user clicks "Optimize" on a queued job THEN the system SHALL navigate to optimizer with that job loaded
4. WHEN the user clicks "Process All" THEN the system SHALL batch process all pending jobs and save results
5. WHEN a queued job is completed THEN it SHALL move to the Applications/Saved Resumes view automatically
6. WHEN a queued job fails THEN the system SHALL show the error and allow retry or manual intervention

### Requirement 7: Clear Navigation Structure

**User Story:** As a user, I want to always know where I am and how to get where I need to go.

#### Acceptance Criteria

1. WHEN on any screen THEN the system SHALL show a consistent navigation menu with: Dashboard, Optimize, Queue, Applications, Vault, Chat
2. WHEN the user has unsaved work AND clicks navigation THEN the system SHALL either auto-save or warn before navigating
3. WHEN on the Dashboard THEN the system SHALL show clear entry points to primary actions: Optimize Resume, View Queue, Chat with Agent
4. IF the vault is empty THEN the Dashboard SHALL prominently feature "Get Started" with vault population options
5. WHEN navigation would lose data THEN the system SHALL NOT silently discard it - either auto-save or confirm with user

### Requirement 8: Error Visibility

**User Story:** As a user, I want to see when something goes wrong, not wonder if the app is broken.

#### Acceptance Criteria

1. WHEN any operation fails THEN the system SHALL display a visible error message with: what failed, why (if known), and what to do next
2. WHEN job extraction fails THEN the system SHALL show the specific reason (WAF blocked, timeout, parse error, login required)
3. WHEN optimization fails THEN the system SHALL preserve the job data and allow retry
4. WHEN a background operation (like queue processing) fails THEN the system SHALL show a notification or badge
5. WHEN displaying an error THEN the system SHALL NOT navigate away or clear the user's context

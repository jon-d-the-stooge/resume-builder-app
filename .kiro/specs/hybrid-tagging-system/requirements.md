# Requirements Document: Hybrid Tagging System

## Introduction

The Hybrid Tagging System enhances the Resume Content Ingestion system by implementing a dual-layer tagging approach that combines required structural tags with optional semantic tags. This allows for both rigid organizational structure (for reliable querying and filtering) and flexible semantic enrichment (for discovery and context).

## Glossary

- **Structural Tag**: A required, standardized tag that defines the content type (e.g., #skill, #accomplishment, #education)
- **Semantic Tag**: An optional, AI-generated tag that provides contextual meaning (e.g., #leadership, #python, #machine-learning)
- **Tag Hierarchy**: The relationship between structural and semantic tags, where structural tags are primary and semantic tags are supplementary
- **Tag Consolidation**: The process of merging semantically similar tags to reduce redundancy
- **Tag Mapping**: A system for recognizing and grouping related semantic tags

## Requirements

### Requirement 1: Dual-Layer Tag Structure

**User Story:** As a user, I want content items to have both structural and semantic tags, so that I can reliably filter by type while also discovering content through rich contextual tags.

#### Acceptance Criteria

1. WHEN a Content_Item is created, THE System SHALL apply exactly one required structural tag based on content type
2. WHEN a Content_Item is created, THE System SHALL apply zero or more optional semantic tags based on content meaning
3. WHEN storing tags in markdown, THE System SHALL include both structural and semantic tags in the frontmatter tags array
4. WHEN displaying tags in the UI, THE System SHALL visually distinguish structural tags from semantic tags
5. WHEN searching by tags, THE System SHALL support filtering by structural tags, semantic tags, or both

### Requirement 2: Required Structural Tags

**User Story:** As a system architect, I want a fixed set of structural tags, so that programmatic queries and filters work reliably across all content.

#### Acceptance Criteria

1. WHEN a Content_Item is identified as a job entry, THE System SHALL apply the structural tag #job-entry
2. WHEN a Content_Item is identified as a skill, THE System SHALL apply the structural tag #skill
3. WHEN a Content_Item is identified as an accomplishment, THE System SHALL apply the structural tag #accomplishment
4. WHEN a Content_Item is identified as education, THE System SHALL apply the structural tag #education
5. WHEN a Content_Item is identified as a certification, THE System SHALL apply the structural tag #certification
6. WHEN a Content_Item is identified as a job location, THE System SHALL apply the structural tag #job-location
7. WHEN a Content_Item is identified as a job duration, THE System SHALL apply the structural tag #job-duration
8. WHEN querying by structural tag, THE System SHALL return 100% of content items with that tag

### Requirement 3: AI-Generated Semantic Tags

**User Story:** As a user, I want AI to automatically generate meaningful semantic tags, so that I can discover and filter content by topic, technology, or domain without manual tagging.

#### Acceptance Criteria

1. WHEN the Parser extracts content, THE Parser SHALL generate semantic tags based on content meaning
2. WHEN generating semantic tags, THE Parser SHALL extract technology names (e.g., #python, #aws, #docker)
3. WHEN generating semantic tags, THE Parser SHALL extract domain concepts (e.g., #machine-learning, #devops, #frontend)
4. WHEN generating semantic tags, THE Parser SHALL extract soft skills (e.g., #leadership, #communication, #mentorship)
5. WHEN generating semantic tags, THE Parser SHALL limit to 3-7 tags per content item to avoid over-tagging
6. WHEN semantic tags are generated, THE System SHALL store them alongside structural tags

### Requirement 4: Tag Consolidation

**User Story:** As a user, I want semantically similar tags to be consolidated, so that I don't have fragmented content across synonymous tags like #javascript and #js.

#### Acceptance Criteria

1. WHEN the System detects semantically similar tags, THE System SHALL suggest consolidation to the user
2. WHEN consolidating tags, THE System SHALL maintain a mapping of aliases to canonical tags
3. WHEN a user searches for an alias tag, THE System SHALL return results for the canonical tag
4. WHEN displaying tags, THE System SHALL show the canonical tag name
5. WHEN the user approves consolidation, THE System SHALL update all affected content items
6. WHEN the user rejects consolidation, THE System SHALL preserve both tags as distinct

### Requirement 5: Tag Mapping and Aliases

**User Story:** As a user, I want the system to recognize that #js and #javascript are the same thing, so that searches work regardless of which variant I use.

#### Acceptance Criteria

1. WHEN the System initializes, THE System SHALL load a predefined tag mapping configuration
2. WHEN a tag mapping exists, THE System SHALL treat all aliases as equivalent to the canonical tag
3. WHEN searching by an alias tag, THE System SHALL return results tagged with any variant
4. WHEN the user creates a new tag mapping, THE System SHALL persist it for future use
5. WHEN displaying tags, THE System SHALL show the canonical form but indicate aliases exist
6. WHEN the user queries tag statistics, THE System SHALL aggregate counts across all aliases

### Requirement 6: Tag Hierarchy and Relationships

**User Story:** As a user, I want to understand relationships between tags, so that I can navigate from broad categories to specific technologies.

#### Acceptance Criteria

1. WHEN the System stores tags, THE System SHALL support parent-child relationships between tags
2. WHEN a child tag is applied, THE System SHALL optionally apply the parent tag automatically
3. WHEN searching by a parent tag, THE System SHALL optionally include results with child tags
4. WHEN displaying tag hierarchies, THE System SHALL show the tree structure in the UI
5. WHEN the user creates a tag relationship, THE System SHALL validate no circular dependencies exist

### Requirement 7: Tag Suggestion and Auto-Complete

**User Story:** As a user, I want tag suggestions when manually entering content, so that I use consistent tags and discover existing tags.

#### Acceptance Criteria

1. WHEN a user types in a tag field, THE System SHALL suggest existing tags that match the input
2. WHEN suggesting tags, THE System SHALL prioritize frequently used tags
3. WHEN suggesting tags, THE System SHALL include both structural and semantic tags
4. WHEN suggesting tags, THE System SHALL show tag usage counts
5. WHEN the user selects a suggested tag, THE System SHALL apply the canonical form

### Requirement 8: Tag Analytics and Insights

**User Story:** As a user, I want to see which tags are most common in my content, so that I can understand my skill distribution and experience focus areas.

#### Acceptance Criteria

1. WHEN the user requests tag analytics, THE System SHALL display tag usage statistics
2. WHEN displaying statistics, THE System SHALL show tag frequency counts
3. WHEN displaying statistics, THE System SHALL show tag co-occurrence patterns
4. WHEN displaying statistics, THE System SHALL group by structural tag categories
5. WHEN displaying statistics, THE System SHALL highlight underutilized or orphaned tags

### Requirement 9: Tag Migration and Cleanup

**User Story:** As a user, I want to rename or merge tags across all my content, so that I can maintain a clean and consistent tag system over time.

#### Acceptance Criteria

1. WHEN the user initiates tag migration, THE System SHALL show all content items affected
2. WHEN migrating tags, THE System SHALL support renaming a tag across all content
3. WHEN migrating tags, THE System SHALL support merging multiple tags into one
4. WHEN migrating tags, THE System SHALL support splitting a tag into multiple tags
5. WHEN migration completes, THE System SHALL update all markdown files in the vault
6. WHEN migration completes, THE System SHALL provide a summary of changes made

### Requirement 10: Backward Compatibility

**User Story:** As a developer, I want the hybrid tagging system to work with existing content, so that previously ingested resumes don't break.

#### Acceptance Criteria

1. WHEN the System encounters content with only semantic tags, THE System SHALL infer and add the appropriate structural tag
2. WHEN the System encounters content with only structural tags, THE System SHALL continue to function normally
3. WHEN the System encounters content with mixed tag formats, THE System SHALL normalize to the hybrid format
4. WHEN querying old content, THE System SHALL return results as if they had proper structural tags
5. WHEN the user runs a migration tool, THE System SHALL update all existing content to the hybrid format

## Success Metrics

- Tag consolidation reduces duplicate tags by >50%
- Search recall improves by >20% with semantic tags
- Users can find content 30% faster with hybrid tagging
- Tag maintenance time reduced by >40% with auto-consolidation
- 90% of content has both structural and semantic tags

## Future Enhancements

- Machine learning-based tag suggestion from content similarity
- Automatic tag hierarchy inference from usage patterns
- Tag-based content recommendations
- Visual tag cloud and relationship graphs
- Export tag taxonomy for use in other systems

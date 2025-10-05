# Prompt Changelog

All notable changes to LLM prompts will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and prompts use [Semantic Versioning](https://semver.org/spec/v2.0.0.html):
- **MAJOR** version when you make incompatible prompt changes (breaking changes to output format, tool usage, etc.)
- **MINOR** version when you add functionality in a backward compatible manner (new guidelines, enhanced instructions)
- **PATCH** version when you make backward compatible fixes (typos, clarifications, minor improvements)

## [Unreleased]

## [1.0.0] - 2025-10-05

### Added - edit-content-mcp
- Initial version with MCP tool support for autonomous fetching and saving
- System instructions for da.live content editing
- Editing guidelines with HTML formatting rules
- JSON response format requirement
- MCP tool workflow (get_dalive_content → edit → save_dalive_content)
- Strict preservation rules for facts, brands, and HTML structure
- Parameters: temperature 0.7, max_tokens 4096

### Design Decisions
- Separated system instructions, guidelines, and context template for maintainability
- Emphasized autonomous MCP tool calling workflow
- Added explicit HTML formatting rules to prevent unwanted reformatting
- Required structured JSON response for consistent parsing

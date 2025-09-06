# File Loader Implementation Plan for teXt0wnz

## Overview

This document outlines a comprehensive, step-by-step implementation plan for porting the file loading functionality from the legacy `moebius-web` application to the new `teXt0wnz` editor. The goal is to enable loading external files (specifically `.ans` files) into the editor with proper SAUCE metadata extraction and canvas rendering.

## Objective

Create a robust file loader module that:
- Supports ANSI (.ans) files with SAUCE metadata
- Integrates seamlessly with the existing teXt0wnz architecture
- Maintains the event-driven design pattern
- Provides comprehensive error handling
- Includes thorough testing coverage

## Architecture Analysis

### Current teXt0wnz Architecture
- **Event Bus System**: Centralized PubSub pattern for component communication
- **Modular Design**: Separate modules for canvas rendering, font management, tools, etc.
- **TypeScript**: Type-safe development with comprehensive interfaces
- **Testing Infrastructure**: Vitest for unit tests, Playwright for E2E tests
- **Build System**: Custom CICaDa build system with ESBuild and PostCSS

### Legacy moebius-web Implementation
- **Comprehensive File Support**: ANSI, XBin, BIN formats
- **SAUCE Parsing**: Full SAUCE metadata extraction and processing
- **Font Mapping**: Bidirectional mapping between SAUCE and application font names
- **Canvas Integration**: Direct canvas manipulation with color mapping
- **File Processing**: Efficient binary data processing utilities

## Implementation Plan

### Phase 1: Core Infrastructure & SAUCE Parser
**Duration**: 2-3 development sessions
**Testability**: High - isolated utility functions

#### Step 1.1: Create SAUCE Metadata Parser
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Implement robust SAUCE metadata extraction

**Tasks**:
1. Create `SauceMetadata` interface based on SAUCE specification
2. Implement `parseSauce(bytes: Uint8Array): SauceMetadata | null`
3. Add utility functions for reading binary data (get16, get32, getS)
4. Handle SAUCE comments extraction
5. Implement font name mapping utilities

**Testing**:
- Unit tests with known SAUCE data
- Test with x0-outlaw-research.ans file
- Validate metadata extraction accuracy
- Test edge cases (no SAUCE, malformed SAUCE)

**Acceptance Criteria**:
- Successfully extracts title: "outlaw research"
- Extracts author: "x0^67^aMi5H^iMP!"  
- Extracts group: "blocktronics"
- Extracts canvas dimensions and font information
- Returns null for files without SAUCE

#### Step 1.2: File Reading Utilities
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Create consistent binary file reading interface

**Tasks**:
1. Implement `FileReader` class with position tracking
2. Add methods: `get()`, `get16()`, `get32()`, `getC()`, `getS()`
3. Implement `seek()`, `peek()`, `eof()` methods
4. Add `lookahead()` for pattern matching

**Testing**:
- Unit tests for all reading methods
- Test position tracking accuracy
- Validate endianness handling
- Test boundary conditions

**Acceptance Criteria**:
- Consistent API for binary data access
- Proper little-endian handling
- Accurate position tracking
- Error handling for out-of-bounds access

#### Step 1.3: File Type Detection
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Automatic file format detection

**Tasks**:
1. Implement `detectFileType(filename: string, data: Uint8Array): FileType`
2. Add support for .ans, .xb, .bin extensions
3. Implement magic number detection for XBin files
4. Add fallback to ANSI for unknown types

**Testing**:
- Unit tests for each file type
- Test filename extension handling
- Test magic number detection
- Test fallback behavior

**Acceptance Criteria**:
- Accurate file type detection
- Proper handling of edge cases
- Support for case-insensitive extensions

### Phase 2: ANSI File Processing
**Duration**: 3-4 development sessions
**Testability**: High - parser functions with known outputs

#### Step 2.1: ANSI Escape Sequence Parser
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Process ANSI escape sequences for cursor control and formatting

**Tasks**:
1. Implement `AnsiState` interface for tracking cursor and attributes
2. Create escape sequence parser with state machine
3. Handle cursor movement commands (A, B, C, D, H)
4. Process formatting commands (m for colors and attributes)
5. Implement screen clearing commands (J, K)

**Testing**:
- Unit tests for each escape sequence type
- Test state transitions
- Validate cursor position calculations
- Test attribute handling (bold, blink, inverse)

**Acceptance Criteria**:
- Accurate cursor positioning
- Proper color and attribute processing
- Correct screen clearing behavior
- Robust error handling for malformed sequences

#### Step 2.2: ANSI Color and Attribute System
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Implement proper color mapping and attribute handling

**Tasks**:
1. Create color mapping between ANSI and internal format
2. Implement `binColor()` mapping function
3. Handle bold (high intensity) colors
4. Process blinking backgrounds
5. Implement inverse video mode

**Testing**:
- Unit tests for color mappings
- Test all 16 standard colors
- Validate attribute combinations
- Test inverse mode rendering

**Acceptance Criteria**:
- Accurate color reproduction
- Proper handling of all text attributes
- Correct inverse video rendering

#### Step 2.3: Canvas Data Generation
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Convert parsed ANSI to canvas-compatible format

**Tasks**:
1. Implement `ScreenData` class for canvas buffer management
2. Create character placement methods
3. Handle dynamic canvas resizing
4. Generate final canvas data in teXt0wnz format
5. Implement row stripping for trailing whitespace

**Testing**:
- Unit tests for canvas operations
- Test dynamic resizing
- Validate data format compatibility
- Test with x0-outlaw-research.ans

**Acceptance Criteria**:
- Generates proper canvas data
- Handles variable canvas sizes
- Compatible with existing renderer
- Produces expected visual output

### Phase 3: Integration & Event System
**Duration**: 2-3 development sessions
**Testability**: Medium - integration points with existing systems

#### Step 3.1: Event Bus Integration
**Files to modify**: `src/scripts/fileLoader.ts`, `src/scripts/eventBus.ts`
**Goal**: Integrate file loading with existing event system

**Tasks**:
1. Extend event types for file loading operations
2. Add `file:load:start`, `file:load:success`, `file:load:error` events
3. Implement progress reporting for large files
4. Add metadata events for SAUCE information
5. Create error event payloads with detailed information

**Testing**:
- Unit tests for event emission
- Test event payload structure
- Validate error handling
- Test progress reporting

**Acceptance Criteria**:
- Proper event emission at all stages
- Comprehensive error information
- Progress feedback for users
- Type-safe event payloads

#### Step 3.2: Main File Loading Interface
**Files to modify**: `src/scripts/fileLoader.ts`
**Goal**: Create primary file loading API

**Tasks**:
1. Implement `loadFile(file: File): Promise<LoadResult>`
2. Add file validation and size limits
3. Integrate SAUCE parsing with canvas generation
4. Handle multiple file formats consistently
5. Implement proper error recovery

**Testing**:
- Unit tests for main API
- Test with various file sizes
- Validate error conditions
- Test file format support

**Acceptance Criteria**:
- Clean, Promise-based API
- Comprehensive error handling
- Support for all target formats
- Performance optimization

#### Step 3.3: UI Controller Integration
**Files to modify**: `src/scripts/uiController.ts`
**Goal**: Replace placeholder file handler with full implementation

**Tasks**:
1. Remove placeholder alert() handler
2. Integrate with file loader module
3. Add loading states and user feedback
4. Implement error display
5. Update canvas state after successful load

**Testing**:
- Unit tests for UI integration
- Test loading state management
- Validate error display
- Test canvas update behavior

**Acceptance Criteria**:
- Seamless file upload experience
- Clear user feedback
- Proper error handling
- Canvas state consistency

### Phase 4: Testing & Validation
**Duration**: 2-3 development sessions
**Testability**: High - comprehensive test coverage

#### Step 4.1: Comprehensive Unit Testing
**Files to create**: `tests/unit/fileLoader.test.ts`, `tests/unit/sauceParser.test.ts`
**Goal**: Achieve >90% test coverage for file loading functionality

**Tasks**:
1. Create comprehensive unit tests for all functions
2. Test with known good ANSI files
3. Test error conditions and edge cases
4. Mock file system interactions
5. Performance testing with large files

**Testing Strategy**:
- Test-driven development for new components
- Regression testing with legacy outputs
- Property-based testing for parsers
- Mock external dependencies

**Acceptance Criteria**:
- >90% code coverage
- All edge cases covered
- Performance benchmarks met
- No test flakiness

#### Step 4.2: End-to-End Testing
**Files to create**: `tests/e2e/file-loading.spec.ts`
**Goal**: Validate complete file loading workflow

**Tasks**:
1. Create E2E tests for file upload flow
2. Test with x0-outlaw-research.ans file
3. Validate canvas rendering output
4. Test error scenarios
5. Verify SAUCE metadata display

**Testing Strategy**:
- Real file uploads through browser
- Visual regression testing
- User interaction simulation
- Cross-browser compatibility

**Acceptance Criteria**:
- Complete upload workflow works
- Correct visual rendering
- SAUCE metadata properly displayed
- Error handling works in browser

#### Step 4.3: Integration Testing
**Files to modify**: Existing test files
**Goal**: Ensure no regressions in existing functionality

**Tasks**:
1. Run full test suite with new changes
2. Update any broken tests
3. Add integration tests for new event flows
4. Performance testing
5. Memory leak detection

**Testing Strategy**:
- Continuous integration validation
- Cross-platform testing
- Performance profiling
- Memory usage analysis

**Acceptance Criteria**:
- All existing tests pass
- No performance regressions
- No memory leaks
- Stable integration points

### Phase 5: Documentation & Polish
**Duration**: 1-2 development sessions
**Testability**: Low - documentation and final polish

#### Step 5.1: API Documentation
**Files to modify**: All modified TypeScript files
**Goal**: Comprehensive documentation for maintainability

**Tasks**:
1. Add JSDoc comments to all public APIs
2. Document SAUCE metadata structure
3. Create usage examples
4. Add inline code comments for complex logic
5. Update README if necessary

**Acceptance Criteria**:
- Complete JSDoc coverage
- Clear usage examples
- Well-documented interfaces
- Maintainable code comments

#### Step 5.2: Error Handling & User Experience
**Files to modify**: `src/scripts/fileLoader.ts`, `src/scripts/uiController.ts`
**Goal**: Polish user experience and error handling

**Tasks**:
1. Implement user-friendly error messages
2. Add file format validation feedback
3. Optimize loading performance
4. Add loading progress indicators
5. Implement cancellation support

**Acceptance Criteria**:
- Clear, actionable error messages
- Responsive loading experience
- Cancellation support
- Performance optimizations

#### Step 5.3: Final Validation
**Goal**: Ensure implementation meets all requirements

**Tasks**:
1. Test with x0-outlaw-research.ans file
2. Verify skull/cowboy hat renders correctly
3. Validate SAUCE metadata extraction
4. Check canvas dimensions and font loading
5. Performance and memory validation

**Acceptance Criteria**:
- x0-outlaw-research.ans loads successfully
- Renders "OUTLAW RESEARCH" skull artwork
- SAUCE metadata properly extracted
- Canvas size reflects file dimensions
- CP437 font loads correctly

## Technical Specifications

### File Format Support
- **Primary**: ANSI (.ans) files with SAUCE metadata
- **Future**: XBin (.xb) and BIN (.bin) file support
- **Encoding**: Support for CP437, CP850, CP852 character sets

### SAUCE Metadata Support
- Full SAUCE v00.5 specification compliance
- Title, author, group extraction
- Canvas dimensions and font information
- Comment block support
- ANSi flags for ice colors and letter spacing

### Performance Requirements
- Files up to 64KB should load in <100ms
- Memory usage should not exceed 2x file size
- Support for cancellation of large file loads
- Progress reporting for files >10KB

### Error Handling
- Graceful degradation for files without SAUCE
- Clear error messages for unsupported formats
- Validation of file size limits
- Recovery from partial load failures

## Testing Strategy

### Unit Testing
- **Coverage Target**: >90% for file loading modules
- **Test Data**: Include known good ANSI files
- **Mock Strategy**: Mock file system and canvas APIs
- **Performance**: Benchmark critical parsing functions

### Integration Testing
- **Event System**: Test all event emissions
- **Canvas Integration**: Verify rendering output
- **UI Integration**: Test complete upload workflow
- **Error Scenarios**: Test all error conditions

### End-to-End Testing
- **File Upload**: Complete browser-based upload flow
- **Visual Validation**: Verify correct rendering
- **Metadata Display**: Check SAUCE information display
- **Cross-browser**: Test in Chrome, Firefox, Safari

### Validation Testing
- **x0-outlaw-research.ans**: Primary test file
- **Visual Output**: Skull in cowboy hat with "OUTLAW RESEARCH"
- **Metadata**: Author "x0^67^aMi5H^iMP!", Group "blocktronics"
- **Dimensions**: Non-standard canvas size from SAUCE

## Success Criteria

### Functional Requirements
1. ✅ Load x0-outlaw-research.ans file successfully
2. ✅ Extract complete SAUCE metadata
3. ✅ Render colored skull artwork correctly
4. ✅ Display "OUTLAW RESEARCH" text clearly
5. ✅ Set proper canvas dimensions from SAUCE
6. ✅ Load CP437 font based on SAUCE metadata

### Technical Requirements
1. ✅ Integrate with existing event bus system
2. ✅ Maintain TypeScript type safety
3. ✅ Achieve >90% test coverage
4. ✅ No performance regressions
5. ✅ Clean, maintainable code
6. ✅ Comprehensive error handling

### User Experience Requirements
1. ✅ Intuitive file upload interface
2. ✅ Clear loading feedback
3. ✅ Helpful error messages
4. ✅ Responsive performance
5. ✅ Cancellation support

## Risk Assessment

### High Risk Items
- **ANSI Parsing Complexity**: Complex escape sequence handling
- **Color Mapping**: Accurate color reproduction from legacy format
- **Canvas Integration**: Compatibility with existing renderer
- **Performance**: Large file processing speed

### Mitigation Strategies
- Incremental development with frequent testing
- Reference implementation validation
- Performance profiling at each step
- Comprehensive test coverage

### Contingency Plans
- Fallback to simplified ANSI parsing if needed
- Progressive enhancement for advanced features
- Performance optimization as separate phase
- Optional features can be deferred

## Timeline Estimate

- **Phase 1 (Infrastructure)**: 3-4 hours
- **Phase 2 (ANSI Processing)**: 4-6 hours  
- **Phase 3 (Integration)**: 3-4 hours
- **Phase 4 (Testing)**: 4-5 hours
- **Phase 5 (Documentation)**: 2-3 hours

**Total Estimated Time**: 16-22 hours across 8-12 development sessions

## Dependencies

### External Dependencies
- No new external dependencies required
- Utilizes existing Vitest and Playwright testing
- Leverages current event bus and canvas systems

### Internal Dependencies
- Event bus system for integration
- Canvas renderer for display
- Font manager for font loading
- UI controller for file upload handling

## Future Enhancements

### Extended Format Support
- XBin (.xb) files with embedded fonts and palettes
- BIN (.bin) files with SAUCE metadata
- UTF-8 ANSI files
- ICE color support

### Advanced Features
- Drag and drop file upload
- Clipboard paste support
- File format conversion
- Batch file processing
- Preview thumbnails

### Performance Optimizations
- Streaming parser for large files
- Web Worker processing
- Progressive rendering
- Caching mechanisms

---

*This implementation plan provides a comprehensive roadmap for successfully porting the file loading functionality from moebius-web to teXt0wnz while maintaining code quality, performance, and user experience standards.*
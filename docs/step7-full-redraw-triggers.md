# Step 7: Full Redraw Triggers - Implementation Documentation

This document describes the implementation of Step 7 from the "Efficient Selective Canvas Redraw" refactor project, which defines exactly when full canvas redraws should occur.

## Overview

Step 7 establishes clear rules for when a full canvas redraw is necessary versus when the dirty region system should be used. This optimization ensures that expensive full redraws only happen when absolutely required.

## Full Redraw Triggers

Full canvas redraws are ONLY triggered for the following scenarios:

### 1. Canvas Resize
- **Trigger**: Canvas viewport or logical dimensions change
- **Event**: `ui:state:changed` when canvas size changes
- **Reason**: Canvas resize affects the entire visible area and requires complete re-rendering
- **Implementation**: `resizeCanvasToState()` → `forceFullRedraw()`

### 2. Font Changes
- **Trigger**: Font type, size, or renderer changes
- **Event**: Font change via `setFont()` mutator
- **Reason**: Font changes affect the rendering of every character on the canvas
- **Implementation**: `canvasRenderer.setFont()` → `forceFullRedraw()`

### 3. Palette Changes
- **Trigger**: Color palette is modified
- **Event**: `local:palette:changed`
- **Reason**: Palette changes affect the color rendering of all canvas content
- **Implementation**: Event listener → `forceFullRedraw()`

### 4. Buffer Reset Operations
- **Trigger**: Canvas data is completely replaced or reset
- **Events**: 
  - `local:file:loaded` - New file loaded
  - `local:canvas:cleared` - Canvas explicitly cleared
  - `updateCanvasData()` - Canvas data replaced externally
- **Reason**: Buffer resets invalidate all existing content
- **Implementation**: Event listeners and function calls → `forceFullRedraw()`

### 5. Initial Render
- **Trigger**: Application startup
- **Event**: Canvas renderer initialization
- **Reason**: Initial state requires complete canvas setup
- **Implementation**: `initCanvasRenderer()` → `forceFullRedraw()`

## Operations That Do NOT Trigger Full Redraws

The following operations use the dirty region system instead:

### ❌ Tool Activation
- **Previous Behavior**: `local:tool:activated` triggered full redraw
- **New Behavior**: Removed event listener - tools only mark dirty regions
- **Reason**: Tool activation should not affect existing canvas content

### ❌ Single Cell Edits
- **Behavior**: Use `enqueueDirtyRegion()` with 1x1 regions
- **Reason**: Only the modified cell needs redraw

### ❌ Network Patches
- **Behavior**: Apply patch → enqueue dirty region → process region
- **Reason**: Network changes affect only specific regions

### ❌ Multi-Cell Drawing Operations
- **Behavior**: Mark affected regions as dirty
- **Reason**: Even large operations affect bounded regions, not the entire canvas

## Implementation Details

### Event Listeners
```typescript
// Full redraw triggers
eventBus.subscribe('ui:state:changed', () => {
  resizeCanvasToState();
  forceFullRedraw();
});

eventBus.subscribe('local:palette:changed', () => {
  forceFullRedraw();
});

eventBus.subscribe('local:file:loaded', () => {
  forceFullRedraw();
});

eventBus.subscribe('local:canvas:cleared', () => {
  forceFullRedraw();
});

// Removed: 'local:tool:activated' listener
```

### Function Flow
1. **Full Redraw**: `forceFullRedraw()` → `needsFullRedraw = true` → `queueFlushDirty()`
2. **Dirty Region**: `enqueueDirtyRegion()` → region queue → `processDirtyRegions()`

### Performance Impact
- **Full Redraw**: O(width × height) - renders every canvas cell
- **Dirty Region**: O(dirty cells) - renders only changed cells
- **Typical Improvement**: 100x-1000x faster for small edits

## Testing

### Unit Tests
Step 7 includes documentation tests that verify:
- Full redraw triggers are clearly defined
- Tool activation no longer triggers full redraw
- Behavior is consistent across the application

### Validation
To validate Step 7 implementation:
1. Check that tool usage doesn't cause full canvas refresh
2. Verify palette/font changes do cause full refresh
3. Confirm file loading triggers full refresh
4. Ensure single-cell edits only redraw affected areas

## Future Considerations

### Optimization Opportunities
- **Partial Palette Updates**: If only specific colors change, could mark regions using those colors
- **Smart Font Changes**: If font dimensions don't change, could avoid full redraw
- **Incremental Resize**: For small resize operations, could extend canvas rather than full redraw

### Monitoring
Consider adding metrics to track:
- Full redraw frequency
- Dirty region processing performance
- User operation response times

## Benefits

Step 7 implementation provides:
1. **Predictable Performance**: Clear rules for when expensive operations occur
2. **User Responsiveness**: Tool actions remain fast regardless of canvas size  
3. **Efficient Collaboration**: Network updates don't trigger unnecessary redraws
4. **Scalability**: Large canvases remain performant for local edits
5. **Maintainability**: Clear separation between full redraw and incremental update logic

This establishes a solid foundation for efficient canvas rendering that scales with both canvas size and user activity.
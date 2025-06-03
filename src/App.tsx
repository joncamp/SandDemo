import './App.css'
import { useState, useRef, useEffect } from 'react';
import type { P5CanvasInstance } from "@p5-wrapper/react";
import { ReactP5Wrapper } from "@p5-wrapper/react";

let grid: any[][] = [];

// Consider making the canvas size based on the size of rows/cols
const cellWidth = 10;
let cols: number = 80;
let rows: number = 100;
let width: number = cols * cellWidth;
let height: number = rows * cellWidth;
let showGrid: boolean = false;

let currentColor: any;
let emptyColor: any;
let currentColorIndex = 0;

// Define available colors
const COLORS: [number, number, number][] = [
  [255, 0, 0],    // Red
  [0, 255, 0],    // Green
  [0, 0, 255],    // Blue
  [255, 255, 0],  // Yellow
  [255, 0, 255]   // Magenta
];

let flashingCells: Set<string> = new Set();
let flashCount: number = 0;
const FLASH_DURATION = 15; // Number of flashes before removal
let framesSinceLastUpdate = 0;
const SETTLE_DELAY = 5; // Number of frames to wait before checking for paths

// Define tetromino shapes (scaled up 2x)
const TETROMINOES = [
  [ // I
    [1, 1, 1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1, 1, 1]
  ],
  [ // O
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1]
  ],
  [ // T
    [0, 0, 1, 1, 0, 0],
    [0, 0, 1, 1, 0, 0],
    [1, 1, 1, 1, 1, 1],
    [1, 1, 1, 1, 1, 1]
  ],
  [ // L
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 1, 0, 0],
    [1, 1, 1, 1],
    [1, 1, 1, 1]
  ],
  [ // J
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [0, 0, 1, 1],
    [1, 1, 1, 1],
    [1, 1, 1, 1]
  ],
  [ // S
    [0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1],
    [1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 0, 0]
  ],
  [ // Z
    [1, 1, 1, 1, 0, 0],
    [1, 1, 1, 1, 0, 0],
    [0, 0, 1, 1, 1, 1],
    [0, 0, 1, 1, 1, 1]
  ]
];

function make2DArray(cols: number, rows: number, p5: P5CanvasInstance) {
  const arr = new Array(rows);
  for (let row = 0; row < rows; row++) {
    arr[row] = new Array(cols).fill(emptyColor);
  }
  return arr;
}

function isSameColor(color1: any, color2: any): boolean {
  return color1.levels[0] === color2.levels[0] && 
         color1.levels[1] === color2.levels[1] && 
         color1.levels[2] === color2.levels[2];
}

function findConnectedCells(grid: any[][], startRow: number, startCol: number, targetColor: any): Set<string> {
  const visited = new Set<string>();
  const queue: [number, number][] = [[startRow, startCol]];
  const connected = new Set<string>();
  
  while (queue.length > 0) {
    const [row, col] = queue.shift()!;
    const key = `${row},${col}`;
    
    if (visited.has(key)) continue;
    visited.add(key);
    
    if (row < 0 || row >= rows || col < 0 || col >= cols) continue;
    if (!isSameColor(grid[row][col], targetColor)) continue;
    
    connected.add(key);
    
    // Check adjacent cells (up, right, down, left)
    const directions = [[-1, 0], [0, 1], [1, 0], [0, -1]];
    for (const [dx, dy] of directions) {
      const newRow = row + dx;
      const newCol = col + dy;
      const newKey = `${newRow},${newCol}`;
      
      if (!visited.has(newKey) && 
          newRow >= 0 && newRow < rows && 
          newCol >= 0 && newCol < cols && 
          isSameColor(grid[newRow][newCol], targetColor)) {
        queue.push([newRow, newCol]);
      }
    }
  }
  
  return connected;
}

function checkAndRemovePath(grid: any[][]) {
  // Only check for paths after the sand has had time to settle
  if (framesSinceLastUpdate < SETTLE_DELAY) {
    framesSinceLastUpdate++;
    return;
  }
  framesSinceLastUpdate = 0;

  // Check each cell in the leftmost column
  for (let row = 0; row < rows; row++) {
    if (grid[row][0] === emptyColor) continue;
    
    const targetColor = grid[row][0];
    const connected = findConnectedCells(grid, row, 0, targetColor);
    
    // Check if any connected cell is in the rightmost column
    let spansWidth = false;
    for (const key of connected) {
      const [_, col] = key.split(',').map(Number);
      if (col === cols - 1) {
        spansWidth = true;
        break;
      }
    }
    
    // If path spans width, start flashing animation
    if (spansWidth && flashingCells.size === 0) {
      flashingCells = new Set(connected);
      flashCount = 0;
    }
  }
}

function createSandBall(grid: any[][], centerX: number, centerY: number, radiusInCells: number, color: any) {
  const centerCol = Math.floor(centerX / cellWidth);
  const centerRow = Math.floor(centerY / cellWidth);

  // Calculate the actual bounds we can use
  const startRow = Math.max(0, centerRow - radiusInCells);
  const endRow = Math.min(rows - 1, centerRow + radiusInCells);
  const startCol = Math.max(0, centerCol - radiusInCells);
  const endCol = Math.min(cols - 1, centerCol + radiusInCells);

  for (let row = startRow; row <= endRow; row++) {
    for (let col = startCol; col <= endCol; col++) {
      // Check if the cell is within the circle
      const dx = col - centerCol;
      const dy = row - centerRow;
      const distance = Math.sqrt(dx * dx + dy * dy);
      
      if (distance <= radiusInCells && grid[row][col] === emptyColor) {
        grid[row][col] = color;
      }
    }
  }
}

function placeTetromino(grid: any[][], startX: number, startY: number, tetromino: number[][], color: any) {
  const startCol = Math.floor(startX / cellWidth);
  const startRow = Math.floor(startY / cellWidth);
  
  // Calculate the center offset of the tetromino
  const tetrominoWidth = tetromino[0].length;
  const offsetCol = Math.floor(tetrominoWidth / 2);
  
  // Adjust the starting position to center the tetromino
  const adjustedStartCol = startCol - offsetCol;

  // Check if we can place the tetromino
  for (let row = 0; row < tetromino.length; row++) {
    for (let col = 0; col < tetromino[row].length; col++) {
      if (tetromino[row][col]) {
        const gridRow = startRow + row;
        const gridCol = adjustedStartCol + col;
        
        // Check if placement is valid
        if (gridRow < 0 || gridRow >= rows || 
            gridCol < 0 || gridCol >= cols || 
            grid[gridRow][gridCol] !== emptyColor) {
          return false;
        }
      }
    }
  }

  // Place the tetromino
  for (let row = 0; row < tetromino.length; row++) {
    for (let col = 0; col < tetromino[row].length; col++) {
      if (tetromino[row][col]) {
        const gridRow = startRow + row;
        const gridCol = adjustedStartCol + col;
        grid[gridRow][gridCol] = color;
      }
    }
  }
  return true;
}

function sketch(p5: P5CanvasInstance) {
  p5.setup = () => {
    p5.createCanvas(width, height);
    p5.colorMode(p5.RGB, 255);
    p5.frameRate(20);
    emptyColor = p5.color(0); // initialize empty to black
    currentColor = p5.color(...COLORS[currentColorIndex]); // initialize with first color
    grid = make2DArray(cols, rows, p5);
  }

  // Add a function to handle canvas resizing
  p5.windowResized = () => {
    p5.resizeCanvas(width, height);
  }

  function updateGrid() {
    // Reset the settle delay counter if any sand moved
    let sandMoved = false;
    
    for (let row = rows - 2; row >= 0; row--) {
      for (let col = 0; col < cols; col++) {
        if (grid[row][col] !== emptyColor) {
          if (grid[row + 1][col] === emptyColor) {
            // Fall Down
            grid[row + 1][col] = grid[row][col];
            grid[row][col] = emptyColor;
            sandMoved = true;
          }
          else {
            let canGoLeftDown: boolean = col > 0 && grid[row + 1][col - 1] === emptyColor;
            let canGoRightDown: boolean = col < cols && grid[row + 1][col + 1] === emptyColor;

            if (canGoLeftDown && canGoRightDown) {
              // If both directions available, randomly pick left or right
              if (Math.random() < 0.5) {
                canGoRightDown = false;
              } else {
                canGoLeftDown = false;
              }
            }

            if (canGoLeftDown && canGoRightDown) {
              throw "Only Left or Right should be available, not both.";
            }

            if (canGoLeftDown) {
              grid[row + 1][col - 1] = grid[row][col];
              grid[row][col] = emptyColor;
              sandMoved = true;
            }

            if (canGoRightDown) {
              grid[row + 1][col + 1] = grid[row][col];
              grid[row][col] = emptyColor;
              sandMoved = true;
            }
          }
        }
      }
    }
    
    // Reset the settle delay if sand moved
    if (sandMoved) {
      framesSinceLastUpdate = 0;
    }
    
    // Check for and remove paths that span the width
    checkAndRemovePath(grid);
  }

  p5.mousePressed = () => {
    // Only process if mouse is within canvas boundaries
    if (p5.mouseX >= 0 && p5.mouseX < width && p5.mouseY >= 0 && p5.mouseY < height) {
      if (p5.mouseButton === p5.RIGHT) {
        // Cycle to next color
        currentColorIndex = (currentColorIndex + 1) % COLORS.length;
        currentColor = p5.color(...COLORS[currentColorIndex]);
      } else {
        // Left click places a random tetromino with a random color
        const randomTetromino = TETROMINOES[Math.floor(Math.random() * TETROMINOES.length)];
        const randomColorIndex = Math.floor(Math.random() * COLORS.length);
        const randomColor = p5.color(...COLORS[randomColorIndex]);
        placeTetromino(grid, p5.mouseX, p5.mouseY, randomTetromino, randomColor);
      }
    }
  }

  p5.draw = () => {
    p5.background(0);
    updateGrid();

    // Handle flashing cells
    if (flashingCells.size > 0) {
      flashCount++;
      if (flashCount >= FLASH_DURATION * 2) { // Multiply by 2 because we toggle each frame
        // Remove the cells after flashing
        for (const key of flashingCells) {
          const [row, col] = key.split(',').map(Number);
          grid[row][col] = emptyColor;
        }
        flashingCells.clear();
        flashCount = 0;
      }
    }

    for (let row = 0; row < rows; row++) {
      for (let col = 0; col < cols; col++) {
        let x = col * cellWidth;
        let y = row * cellWidth;
        
        if (showGrid) {
          p5.stroke(255, 255, 255);
        } else {
          p5.noStroke();
        }

        const cellKey = `${row},${col}`;
        if (flashingCells.has(cellKey) && flashCount % 5 === 0) {
          // Flash effect: alternate between original color and black
          p5.fill(0);
        } else if (grid[row][col] !== emptyColor) {
          p5.fill(grid[row][col]);
        } else {
          p5.fill(0);
        }

        p5.square(x, y, cellWidth);
      }
    }
  };
}

function clearGrid(p5: P5CanvasInstance) {
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      grid[row][col] = emptyColor;
    }
  }
}

function GridControls({ onResize }: { onResize: () => void }) {
  const [gridCols, setGridCols] = useState(cols);
  const [gridRows, setGridRows] = useState(rows);
  const [showGridState, setShowGridState] = useState(showGrid);

  const handleResize = () => {
    cols = gridCols;
    rows = gridRows;
    width = cols * cellWidth;
    height = rows * cellWidth;
    onResize();
  };

  const toggleGrid = () => {
    showGrid = !showGrid;
    setShowGridState(showGrid);
  };

  return (
    <>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <label htmlFor="cols">Columns:</label>
        <input
          id="cols"
          type="number"
          min="1"
          max="200"
          value={gridCols}
          onChange={(e) => setGridCols(Number(e.target.value))}
          style={{ width: '60px' }}
        />
      </div>
      <div style={{ display: 'flex', alignItems: 'center', gap: '5px' }}>
        <label htmlFor="rows">Rows:</label>
        <input
          id="rows"
          type="number"
          min="1"
          max="200"
          value={gridRows}
          onChange={(e) => setGridRows(Number(e.target.value))}
          style={{ width: '60px' }}
        />
      </div>
      <button 
        onClick={handleResize}
        style={{
          padding: '4px 8px',
          fontSize: '14px',
          cursor: 'pointer',
          backgroundColor: '#2196F3',
          color: 'white',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        Resize Grid
      </button>
      <button 
        onClick={toggleGrid}
        style={{
          padding: '4px 8px',
          fontSize: '14px',
          cursor: 'pointer',
          backgroundColor: showGridState ? '#FF9800' : '#9E9E9E',
          color: 'white',
          border: 'none',
          borderRadius: '4px'
        }}
      >
        {showGridState ? 'Hide Grid' : 'Show Grid'}
      </button>
    </>
  );
}

export function App() {
  const [key, setKey] = useState(0);
  const p5Ref = useRef<P5CanvasInstance | null>(null);

  const handleResize = () => {
    setKey(prev => prev + 1);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'row', alignItems: 'flex-start', gap: '10px', padding: '20px' }}>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '10px', marginBottom: '10px', alignItems: 'center' }}>
          <GridControls onResize={handleResize} />
        </div>
        <ReactP5Wrapper 
          key={key} 
          sketch={(p5) => {
            p5Ref.current = p5;
            return sketch(p5);
          }} 
        />
        <button 
          onClick={() => p5Ref.current && clearGrid(p5Ref.current)}
          style={{
            padding: '8px 16px',
            fontSize: '16px',
            cursor: 'pointer',
            backgroundColor: '#4CAF50',
            color: 'white',
            border: 'none',
            borderRadius: '4px'
          }}
        >
          Clear Grid
        </button>
      </div>
    </div>
  );
}

export default App

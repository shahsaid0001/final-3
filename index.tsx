import React, { useState, useMemo, useRef, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { Canvas, useFrame } from "@react-three/fiber";
import { OrbitControls, Text, Html } from "@react-three/drei";
import * as THREE from "three";

// --- 1. DATA SOURCE ---
const RAW_CSV_DATA = `user_id,hour,day_type,device,content_type,session_minutes,recommended,completed,is_binge
U01,8,weekday,mobile,music,7,no,0,0
U02,9,weekday,mobile,news,6,no,0,0
U03,10,weekday,desktop,search,9,no,1,0
U04,11,weekday,mobile,music,12,yes,1,0
U05,12,weekday,desktop,search,15,no,1,0
U06,13,weekday,mobile,podcast,18,yes,1,0
U07,14,weekday,mobile,music,10,no,0,0
U08,15,weekday,desktop,video,22,yes,1,0
U09,16,weekday,mobile,news,8,no,0,0
U10,17,weekday,desktop,video,28,yes,1,0
U11,18,weekday,mobile,video,25,yes,1,0
U12,19,weekday,desktop,video,40,yes,1,1
U13,20,weekday,desktop,video,55,yes,1,1
U14,21,weekday,mobile,video,34,yes,0,0
U15,22,weekday,desktop,video,70,yes,1,1
U16,23,weekday,mobile,video,45,yes,1,1
U17,0,weekday,mobile,video,30,no,0,0
U18,1,weekday,desktop,video,60,yes,1,1
U19,2,weekday,mobile,music,14,no,0,0
U20,3,weekday,mobile,music,9,no,0,0
U21,9,weekend,mobile,music,15,yes,1,0
U22,11,weekend,mobile,video,32,yes,1,0
U23,13,weekend,desktop,video,48,yes,1,1
U24,15,weekend,mobile,podcast,25,yes,1,0
U25,17,weekend,desktop,video,52,yes,1,1
U26,18,weekend,mobile,video,38,yes,1,0
U27,19,weekend,desktop,video,65,yes,1,1
U28,20,weekend,desktop,video,80,yes,1,1
U29,21,weekend,desktop,video,95,yes,1,1
U30,22,weekend,mobile,video,50,yes,0,1
U31,23,weekend,desktop,video,110,yes,1,1
U32,0,weekend,desktop,video,90,yes,1,1
U33,1,weekend,mobile,music,20,no,0,0
U34,2,weekend,mobile,music,18,no,0,0
U35,3,weekend,mobile,music,12,no,0,0
U36,10,weekend,mobile,news,14,yes,1,0
U37,12,weekend,desktop,search,18,no,1,0
U38,14,weekend,mobile,music,16,no,0,0
U39,16,weekend,desktop,video,35,yes,1,0
U40,18,weekend,desktop,video,60,yes,1,1`;

// --- 2. CONFIG & TYPES ---

const CONTENT_TYPE_ORDER = ["music", "news", "search", "podcast", "video"];
const ROWS_PER_SLICE = 8;

const LAYER_CONFIG: Record<string, { color: string; label: string }> = {
  music: { color: "#3b82f6", label: "Music" },
  news: { color: "#10b981", label: "News" },
  search: { color: "#f59e0b", label: "Search" },
  podcast: { color: "#8b5cf6", label: "Podcast" },
  video: { color: "#ef4444", label: "Video" }
};

type DataRow = Record<string, string | number>;

interface CubeCell {
  id: string;
  x: string; // Content Type
  y: string; // User ID
  z: string; // Batch Label
  grid: [number, number, number];
  metrics: Record<string, number>;
  normalized: number;
  details: DataRow[]; 
}

// --- 3. DATA PROCESSING ---

const processData = (csv: string) => {
  const lines = csv.trim().split("\n");
  const headers = lines[0].split(",").map(h => h.trim());
  
  const rawData: DataRow[] = [];
  lines.slice(1).forEach(line => {
    if (!line.trim()) return;
    const values = line.split(",").map(v => v.trim());
    const row: DataRow = {};
    headers.forEach((h, i) => {
      const val = values[i];
      const num = parseFloat(val);
      if (!isNaN(num) && h !== 'user_id' && h !== 'hour') {
        row[h] = num;
      } else {
        row[h] = val;
      }
    });
    row['session_minutes'] = parseFloat(String(row['session_minutes'])) || 0;
    rawData.push(row);
  });

  const mainMetric = "session_minutes"; 
  const cells: CubeCell[] = [];
  const xValues = CONTENT_TYPE_ORDER; 
  
  const allUsers = Array.from(new Set(rawData.map(d => String(d['user_id']))))
    .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));

  let minM = Infinity;
  let maxM = -Infinity;

  allUsers.forEach((userId, userIdx) => {
      xValues.forEach((contentVal, contentIdx) => {
          const group = rawData.filter(d => 
              String(d['user_id']) === userId && 
              String(d['content_type']) === contentVal
          );

          if (group.length > 0) {
              const aggregatedMetrics: Record<string, number> = {
                  session_minutes: 0,
                  completed_count: 0,
                  binge_count: 0,
                  is_recommended_count: 0
              };

              group.forEach(row => {
                  aggregatedMetrics.session_minutes += Number(row.session_minutes);
                  if (String(row.completed) === '1') aggregatedMetrics.completed_count++;
                  if (String(row.is_binge) === '1') aggregatedMetrics.binge_count++;
                  if (String(row.recommended) === 'yes') aggregatedMetrics.is_recommended_count++;
              });

              const val = aggregatedMetrics[mainMetric];
              if (val < minM) minM = val;
              if (val > maxM) maxM = val;

              const gridY = userIdx % ROWS_PER_SLICE;
              const gridZ = Math.floor(userIdx / ROWS_PER_SLICE);

              cells.push({
                  id: `${contentVal}-${userId}`,
                  x: contentVal,
                  y: userId,
                  z: `Group ${gridZ + 1}`,
                  grid: [contentIdx, gridY, gridZ],
                  metrics: aggregatedMetrics,
                  normalized: 0,
                  details: group
              });
          }
      });
  });

  cells.forEach(c => {
    c.normalized = maxM === minM ? 0.5 : (c.metrics[mainMetric] - minM) / (maxM - minM);
  });

  const numSlices = Math.ceil(allUsers.length / ROWS_PER_SLICE);
  const zLabels = Array.from({length: numSlices}, (_, i) => {
      const start = allUsers[i * ROWS_PER_SLICE];
      const end = allUsers[Math.min((i + 1) * ROWS_PER_SLICE - 1, allUsers.length - 1)];
      return `${start} - ${end}`;
  });
  
  const yLabels = allUsers.slice(0, ROWS_PER_SLICE);

  return { cells, xValues, yLabels, zLabels, mainMetric, allUsers };
};

// --- 4. 3D COMPONENTS ---

const GlassCell = ({ 
  data, 
  position, 
  isSelected, 
  isColHovered, 
  onHover, 
  onSelect 
}: { 
  data: CubeCell; 
  position: [number, number, number]; 
  isSelected: boolean;
  isColHovered: boolean;
  onHover: (d: CubeCell | null) => void;
  onSelect: (d: CubeCell) => void;
}) => {
  const meshRef = useRef<THREE.Mesh>(null);
  const config = LAYER_CONFIG[data.x];
  const [hovered, setHovered] = useState(false);

  useFrame((state) => {
    if (!meshRef.current) return;
    if (isSelected) {
      const t = state.clock.getElapsedTime();
      meshRef.current.scale.setScalar(1 + Math.sin(t * 3) * 0.05);
    } else {
      meshRef.current.scale.lerp(new THREE.Vector3(1, 1, 1), 0.1);
    }
  });

  const baseOpacity = 0.2 + (data.normalized * 0.6); 
  const activeOpacity = isSelected ? 0.9 : (hovered ? 0.8 : (isColHovered ? 0.5 : baseOpacity));
  
  return (
    <group position={position}>
      <mesh
        ref={meshRef}
        onClick={(e) => { e.stopPropagation(); onSelect(data); }}
        onPointerOver={(e) => { e.stopPropagation(); setHovered(true); onHover(data); }}
        onPointerOut={(e) => { setHovered(false); onHover(null); }}
      >
        <boxGeometry args={[0.9, 0.9, 0.9]} />
        <meshPhysicalMaterial
          color={config.color}
          transparent
          opacity={activeOpacity}
          transmission={0.4}
          roughness={0.1}
          metalness={0.1}
          thickness={1}
          clearcoat={1}
          emissive={config.color}
          emissiveIntensity={isSelected ? 0.8 : (hovered ? 0.4 : 0.05)}
        />
      </mesh>
      
      {(hovered || isSelected) && (
        <Html position={[0, 0.6, 0]} center pointerEvents="none" zIndexRange={[100, 0]}>
          <div style={{ 
            color: 'white', 
            background: 'rgba(0,0,0,0.9)', 
            padding: '4px 8px', 
            borderRadius: '4px',
            fontSize: '12px',
            whiteSpace: 'nowrap',
            border: `1px solid ${config.color}`
          }}>
            <strong>{data.y}</strong><br/>
            {data.metrics['session_minutes']} min
          </div>
        </Html>
      )}
    </group>
  );
};

const CubeScene = ({ 
  data, 
  selectedCell, 
  onHover, 
  onSelect 
}: { 
  data: ReturnType<typeof processData>; 
  selectedCell: CubeCell | null; 
  onHover: (c: CubeCell | null) => void;
  onSelect: (c: CubeCell) => void;
}) => {
  const [hoveredCell, setHoveredCell] = useState<CubeCell | null>(null);

  const spacingX = 2.0; 
  const spacingY = 1.1; 
  const spacingZ = 1.5; 
  
  const width = data.xValues.length * spacingX;
  const height = data.yLabels.length * spacingY;
  const depth = data.zLabels.length * spacingZ;

  const handleHover = (c: CubeCell | null) => {
    setHoveredCell(c);
    onHover(c);
  };

  return (
    <group position={[-(width/2) + (spacingX/2), -(height/2) + 0.5, -(depth/2) + 1]}>
      {data.cells.map((cell) => (
        <GlassCell
          key={cell.id}
          data={cell}
          position={[cell.grid[0] * spacingX, cell.grid[1] * spacingY, -cell.grid[2] * spacingZ]}
          isSelected={selectedCell?.id === cell.id}
          isColHovered={hoveredCell?.x === cell.x}
          onHover={handleHover}
          onSelect={onSelect}
        />
      ))}

      {/* X Axis Labels */}
      {data.xValues.map((xVal, i) => (
        <group key={`x-${i}`} position={[i * spacingX, -1.5, 0]}>
            <Text 
                fontSize={0.45} 
                color={LAYER_CONFIG[xVal].color}
                anchorX="center"
                anchorY="top"
            >
            {LAYER_CONFIG[xVal].label}
            </Text>
        </group>
      ))}
      
      {/* Y Axis Labels */}
      {data.yLabels.map((yVal, i) => (
        <Text key={`y-${i}`} position={[-1.2, i * spacingY, 0]} fontSize={0.3} color="#666" anchorX="right">
          {yVal}
        </Text>
      ))}
      <Text position={[-2.5, height / 2 - 0.5, 0]} rotation={[0, 0, Math.PI / 2]} fontSize={0.4} color="white">
        USER ID
      </Text>

      {/* Z Axis Labels */}
      {data.zLabels.map((zVal, i) => (
        <Text key={`z-${i}`} position={[width + 0.5, 0, -i * spacingZ]} fontSize={0.35} color="#aaa" anchorX="left">
           ← {zVal}
        </Text>
      ))}
    </group>
  );
};

// --- 5. UI PANEL ---

interface GlobalStats {
    userCount: number;
    totalHours: number;
    avgMin: number;
    totalBinge: number;
}

const InfoPanel = ({ 
    cell, 
    metricKey, 
    globalStats, 
    onNavigate 
}: { 
    cell: CubeCell | null, 
    metricKey: string,
    globalStats: GlobalStats,
    onNavigate: (direction: 1 | -1) => void
}) => {
  const renderContent = () => {
    if (!cell) {
        return (
            <>
                <div className="panel-header" style={{ borderLeftColor: '#fff' }}>
                    <div className="subtitle">DATASET OVERVIEW</div>
                    <h2 style={{ color: '#fff' }}>All Users</h2>
                    <div style={{ color: '#888', marginTop: '4px' }}>Aggregate Statistics</div>
                </div>

                <div className="kpi-grid">
                    <div className="kpi-card main">
                        <label>TOTAL HOURS</label>
                        <div className="value">{globalStats.totalHours} <span style={{fontSize: '16px'}}>hrs</span></div>
                    </div>
                    
                    <div className="kpi-card">
                        <label>ACTIVE USERS</label>
                        <div className="value-sm" style={{color: '#3b82f6'}}>{globalStats.userCount}</div>
                    </div>
                    <div className="kpi-card">
                        <label>AVG TIME/USER</label>
                        <div className="value-sm" style={{color: '#10b981'}}>{globalStats.avgMin}m</div>
                    </div>
                    <div className="kpi-card">
                        <label>TOTAL BINGES</label>
                        <div className="value-sm" style={{color: '#f59e0b'}}>{globalStats.totalBinge}</div>
                    </div>
                </div>

                <div className="dimension-list">
                    <h3>About this Cube</h3>
                    <p style={{fontSize: '13px', color: '#aaa', lineHeight: '1.5'}}>
                        Select a cell to view specific metrics. Use the filter above to find specific users.
                    </p>
                </div>
            </>
        );
    }

    const config = LAYER_CONFIG[cell.x];
    const minutes = cell.metrics.session_minutes;
    const completed = cell.metrics.completed_count;
    const binged = cell.metrics.binge_count;
  
    return (
        <>
            <div className="panel-header" style={{ borderLeftColor: config.color }}>
                <div className="subtitle">SELECTED CELL</div>
                <h2 style={{ color: '#fff' }}>{cell.y}</h2>
                <div style={{ color: config.color, fontWeight: 'bold', fontSize: '18px', marginTop: '4px' }}>
                    {config.label}
                </div>
            </div>

            <div className="kpi-grid">
                <div className="kpi-card main">
                    <label>METRIC VALUE</label>
                    <div className="value">{minutes} <span style={{fontSize: '16px'}}>min</span></div>
                </div>
                
                <div className="kpi-card">
                    <label>COMPLETED</label>
                    <div className="value-sm" style={{color: '#10b981'}}>{completed}</div>
                </div>
                <div className="kpi-card">
                    <label>BINGE COUNT</label>
                    <div className="value-sm" style={{color: '#f59e0b'}}>{binged}</div>
                </div>
            </div>

            <div className="drill-down-list">
                <h3>Details</h3>
                <ul>
                {cell.details.map((row, i) => (
                    <li key={i}>
                        <div style={{display:'flex', flexDirection:'column'}}>
                            <span className="user-badge">{String(row.day_type).toUpperCase()}</span>
                        </div>
                        <span className="user-metric">
                            {row.session_minutes} min
                        </span>
                    </li>
                ))}
                </ul>
            </div>
        </>
    );
  };

  return (
    <div className="panel-container">
        <div className="panel-content">
            {renderContent()}
        </div>
        <div className="panel-footer">
            <button className="nav-btn" onClick={() => onNavigate(-1)}>← Prev User</button>
            <button className="nav-btn" onClick={() => onNavigate(1)}>Next User →</button>
        </div>
    </div>
  );
};

// --- 6. MAIN APP ---

const App = () => {
  const { processedData } = useMemo(() => ({
    processedData: processData(RAW_CSV_DATA)
  }), []);

  const [userFilter, setUserFilter] = useState("");
  const [selectedCell, setSelectedCell] = useState<CubeCell | null>(null);
  const [hoveredCell, setHoveredCell] = useState<CubeCell | null>(null);

  const filteredData = useMemo(() => {
    if (!userFilter.trim()) return processedData;
    const lowerFilter = userFilter.toLowerCase();
    const filteredCells = processedData.cells.filter(c => 
      c.y.toLowerCase().includes(lowerFilter)
    );
    // Return a new data object with filtered cells, preserving axes
    return {
      ...processedData,
      cells: filteredCells
    };
  }, [processedData, userFilter]);

  const globalStats = useMemo(() => {
    let totalMinutes = 0;
    let totalBinge = 0;
    const users = new Set<string>();
    filteredData.cells.forEach(c => {
        totalMinutes += c.metrics.session_minutes;
        totalBinge += c.metrics.binge_count;
        users.add(c.y);
    });
    return {
        userCount: users.size,
        totalHours: Math.round(totalMinutes / 60),
        avgMin: users.size > 0 ? Math.round(totalMinutes / users.size) : 0,
        totalBinge
    };
  }, [filteredData]);

  const handleNavigate = (direction: 1 | -1) => {
    const allUsers = processedData.allUsers; // Navigate through all users or just filtered?
    // Let's navigate through currently visible users if filter is active
    const visibleUsers = Array.from(new Set(filteredData.cells.map(c => c.y)))
        .sort((a, b) => a.localeCompare(b, undefined, { numeric: true }));
    
    if (visibleUsers.length === 0) return;

    let nextIndex = 0;
    if (selectedCell) {
        const currentIndex = visibleUsers.indexOf(selectedCell.y);
        if (currentIndex === -1) {
             nextIndex = 0; // Current selection not in filter, reset
        } else {
            nextIndex = currentIndex + direction;
            if (nextIndex >= visibleUsers.length) nextIndex = 0;
            if (nextIndex < 0) nextIndex = visibleUsers.length - 1;
        }
    }
    const nextUser = visibleUsers[nextIndex];
    const userCells = filteredData.cells.filter(c => c.y === nextUser);
    const targetCell = userCells.find(c => c.x === 'video') || userCells[0];
    if (targetCell) setSelectedCell(targetCell);
  };

  return (
    <div className="app-container">
      <div className="canvas-container">
        <Canvas camera={{ position: [14, 8, 20], fov: 40 }}>
          <color attach="background" args={["#0f1115"]} />
          <fog attach="fog" args={["#0f1115", 25, 60]} />
          <ambientLight intensity={0.6} />
          <pointLight position={[20, 20, 30]} intensity={1} color="#ffffff" />
          <OrbitControls enableDamping autoRotate={!selectedCell} autoRotateSpeed={0.8} target={[3, 4, -4]} />
          <CubeScene 
            data={filteredData} 
            selectedCell={selectedCell}
            onHover={setHoveredCell}
            onSelect={setSelectedCell}
          />
        </Canvas>
      </div>

      <div className="dashboard-panel">
        <div className="panel-top">
          <h1>User Cube Explorer</h1>
          <p>Interactive 3D Data Visualization</p>
          <div style={{marginTop: '16px'}}>
             <input 
                type="text" 
                placeholder="Filter User ID (e.g. U01)..." 
                value={userFilter}
                onChange={(e) => setUserFilter(e.target.value)}
                className="filter-input"
             />
          </div>
        </div>
        <InfoPanel 
            cell={selectedCell} 
            metricKey={processedData.mainMetric}
            globalStats={globalStats}
            onNavigate={handleNavigate}
        />
      </div>

      <style>{`
        .app-container { display: flex; width: 100vw; height: 100vh; background: #0f1115; color: #e0e0e0; }
        .canvas-container { flex: 1; position: relative; }
        .dashboard-panel { width: 400px; background: #161920; border-left: 1px solid #333; display: flex; flex-direction: column; z-index: 10; }
        .panel-top { padding: 24px; border-bottom: 1px solid #2a2e36; }
        .panel-top h1 { margin: 0; font-size: 20px; font-weight: 600; }
        .panel-top p { margin: 4px 0 0; color: #888; font-size: 13px; }
        .panel-container { display: flex; flex-direction: column; flex: 1; overflow: hidden; }
        .panel-content { padding: 24px; overflow-y: auto; flex: 1; }
        .panel-footer { padding: 16px 24px; border-top: 1px solid #2a2e36; display: flex; gap: 12px; background: #1a1d23; }
        .nav-btn { flex: 1; padding: 12px; background: #2a2e36; border: 1px solid #333; color: #fff; border-radius: 4px; cursor: pointer; }
        .nav-btn:hover { background: #3a3e46; }
        .panel-header { border-left: 4px solid #fff; padding-left: 16px; margin-bottom: 32px; }
        .panel-header .subtitle { font-size: 11px; color: #888; letter-spacing: 1px; margin-bottom: 4px; }
        .panel-header h2 { margin: 0; font-size: 28px; }
        .kpi-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-bottom: 32px; }
        .kpi-card { background: #20242c; padding: 16px; border-radius: 8px; border: 1px solid #2a2e36; }
        .kpi-card.main { grid-column: span 2; background: linear-gradient(180deg, #252a33 0%, #20242c 100%); }
        .kpi-card label { display: block; font-size: 11px; color: #888; margin-bottom: 4px; }
        .kpi-card .value { font-size: 32px; font-weight: 700; color: #fff; }
        .kpi-card .value-sm { font-size: 18px; font-weight: 600; color: #ccc; }
        .dimension-list h3, .drill-down-list h3 { font-size: 14px; color: #fff; margin-bottom: 16px; border-bottom: 1px solid #2a2e36; padding-bottom: 8px; }
        .drill-down-list ul { list-style: none; padding: 0; margin: 0; }
        .drill-down-list li { display: flex; justify-content: space-between; align-items: center; padding: 8px 0; border-bottom: 1px solid #222; }
        .user-badge { background: #2a2e36; padding: 2px 8px; border-radius: 4px; font-size: 12px; color: #aaa; font-family: monospace; }
        .user-metric { font-size: 13px; font-weight: 600; }
        
        .filter-input {
            width: 100%;
            padding: 10px 12px;
            border-radius: 6px;
            border: 1px solid #333;
            background: #20242c;
            color: #fff;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s;
        }
        .filter-input:focus {
            border-color: #3b82f6;
        }

        @media (max-width: 768px) {
            .app-container { flex-direction: column; }
            .canvas-container { height: 60vh; flex: none; }
            .dashboard-panel { width: 100%; height: 40vh; border-left: none; border-top: 1px solid #333; }
        }
      `}</style>
    </div>
  );
};

const root = createRoot(document.getElementById("root")!);
root.render(<App />);
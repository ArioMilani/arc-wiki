import React, { useState, useEffect, useMemo } from 'react';
import type { CSSProperties, SyntheticEvent } from 'react';

// --- Interfaces ---

interface ProcessedItem {
  id: string;
  name: string;
  description: string;
  rarity: string;
  type: string;
  weight: number;
  max_stack_size: number;
  sell_value: number;
  imgUrl: string;
  
  // Logic Flags
  isQuestItem: boolean;
  isProjectItem: boolean;
  isUpgradeItem: boolean;
  isSafeToRecycle: boolean;

  // Data for Tooltips
  usedInQuests: string[];
  usedInProjects: string[];
}

// Global Types
type ViewState = 'DASHBOARD' | 'CATEGORY' | 'DETAIL';
type CategoryType = 'QUEST' | 'PROJECT' | 'UPGRADE' | 'RECYCLE';

const CACHE_KEY = 'arc_wiki_items_cache_v14'; // Bumped Version
const CACHE_DURATION = 1000 * 60 * 60; // 1 Hour

// --- FUZZY MATCHING ENGINE ---
// This generates multiple "keys" for a single item name to ensure we find matches
// Example: "Anvil I" -> ["anvili", "anvil1", "anvil_1"]
const generateFuzzyKeys = (raw: string): string[] => {
    if (!raw) return [];
    const lower = String(raw).toLowerCase().trim();
    const keys = new Set<string>();

    // 1. Exact Lowercase
    keys.add(lower);
    
    // 2. Stripped (no spaces, no underscores, no special chars)
    // "Anvil I" -> "anvili", "Anvil_1" -> "anvil1"
    const stripped = lower.replace(/[^a-z0-9]/g, '');
    keys.add(stripped);

    // 3. Roman Numeral Normalization
    // "Anvil I" -> "anvil1", "Anvil II" -> "anvil2"
    let roman = lower;
    if (roman.endsWith(' i')) roman = roman.replace(/ i$/, '1');
    else if (roman.endsWith(' ii')) roman = roman.replace(/ ii$/, '2');
    else if (roman.endsWith(' iii')) roman = roman.replace(/ iii$/, '3');
    else if (roman.endsWith(' iv')) roman = roman.replace(/ iv$/, '4');
    
    keys.add(roman.replace(/[^a-z0-9]/g, '')); // "anvil1"

    // 4. Handle "ARC" prefix variations
    // "ARC Powercell" -> "powercell"
    if (lower.startsWith('arc ')) {
        keys.add(lower.replace('arc ', '').replace(/[^a-z0-9]/g, ''));
    }

    return Array.from(keys);
};

// --- Smart Image Component ---
const ArcImage = ({ item, style }: { item: ProcessedItem, style: CSSProperties }) => {
  const BASE_URL = "https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/images/items";
  const [src, setSrc] = useState(`${BASE_URL}/${item.id}.png`);
  
  useEffect(() => {
    setSrc(`${BASE_URL}/${item.id}.png`);
  }, [item.id]);

  const handleError = (e: SyntheticEvent<HTMLImageElement, Event>) => {
    const img = e.currentTarget;
    // Fallback strategy for images
    if (img.src.includes(item.id)) {
        // Try underscore version: "Anvil I" -> "Anvil_I"
        img.src = `${BASE_URL}/${item.id.replace(/ /g, '_')}.png`;
    } else if (!img.src.includes('lowercase')) {
         // Try lowercase: "Anvil_I" -> "anvil_i"
         img.src = `${BASE_URL}/${item.id.toLowerCase().replace(/ /g, '_')}.png`;
    } else {
        // Hide if all fail
        img.style.opacity = '0.1'; 
    }
  };

  return <img src={src} alt={item.name} style={style} onError={handleError} loading="lazy" />;
};

function App() {
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Navigation
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProcessedItem | null>(null);
  
  // UI
  const [search, setSearch] = useState("");
  const [raidMode, setRaidMode] = useState(false);

  const getText = (data: any): string => {
    if (!data) return "Unknown";
    if (typeof data === 'string') return data;
    if (typeof data === 'object') return data.en || data.default || Object.values(data)[0] as string || "Unknown";
    return String(data);
  };

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        // Clear old cache versions to force logic update
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
              setItems(data);
              setLoading(false);
              return;
            }
          } catch (e) { localStorage.removeItem(CACHE_KEY); }
        }

        const itemsListRes = await fetch("https://api.github.com/repos/RaidTheory/arcraiders-data/contents/items");
        if (!itemsListRes.ok) throw new Error("GitHub Limit Hit.");
        const itemsList = await itemsListRes.json();
        
        const [projectsRes, questsRes] = await Promise.all([
          fetch("https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/projects.json"),
          fetch("https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/quests.json")
        ]);

        const projectsData = projectsRes.ok ? await projectsRes.json() : [];
        const questsData = questsRes.ok ? await questsRes.json() : [];

        // --- 1. Build Usage Index ---
        // We create a Set of ALL keys that are used in quests/projects
        const questKeys = new Set<string>();
        const projectKeys = new Set<string>();
        const upgradeKeys = new Set<string>();

        // Index Quests
        questsData.forEach((quest: any) => {
            const addReq = (id: string) => generateFuzzyKeys(id).forEach(k => questKeys.add(k));
            if (quest.objectives) quest.objectives.forEach((o: any) => o.item && addReq(String(o.item)));
            if (quest.cost) quest.cost.forEach((c: any) => c.item && addReq(String(c.item)));
        });

        // Index Projects
        projectsData.forEach((proj: any) => {
            const pName = getText(proj.name).toLowerCase();
            const isUpgrade = pName.includes('upgrade') || pName.includes('station') || pName.includes('level') || pName.includes('gunsmith') || pName.includes('medical') || pName.includes('bench') || pName.includes('stash');
            
            if (proj.cost) {
                proj.cost.forEach((c: any) => {
                    const keys = generateFuzzyKeys(String(c.item));
                    keys.forEach(k => {
                        if (isUpgrade) upgradeKeys.add(k);
                        else projectKeys.add(k);
                    });
                });
            }
        });

        // --- 2. Process Items ---
        const rawItems: any[] = [];
        const chunkSize = 50;
        if (Array.isArray(itemsList)) {
            for (let i = 0; i < itemsList.length; i += chunkSize) {
                const chunk = itemsList.slice(i, i + chunkSize);
                const chunkPromises = chunk.map((file: any) => 
                    fetch(file.download_url)
                        .then(res => res.json())
                        // Use filename as ID fallback
                        .then(data => ({ ...data, _fileNameId: file.name.replace('.json', '') }))
                        .catch(() => null)
                );
                rawItems.push(...await Promise.all(chunkPromises));
            }
        }

        const processed = rawItems
          .filter(item => item && (item._fileNameId || item.name))
          .map((item: any) => {
            // Determine Best ID
            const safeId = String(item._fileNameId || item.id || "unknown");
            
            // Check Matches using Fuzzy Keys
            const myKeys = generateFuzzyKeys(safeId);
            
            const isQuest = myKeys.some(k => questKeys.has(k));
            const isUpgrade = myKeys.some(k => upgradeKeys.has(k));
            // Only count as "General Project" if not an upgrade
            const isProject = myKeys.some(k => projectKeys.has(k)) && !isUpgrade;
            
            const isSafe = !isQuest && !isProject && !isUpgrade;

            return {
              id: safeId,
              name: getText(item.name),
              rarity: item.rarity || 'Common',
              type: item.type || 'Material',
              description: getText(item.description),
              weight: Number(item.weight) || 0,
              max_stack_size: Number(item.max_stack_size) || 1,
              sell_value: Number(item.sell_value) || 0,
              imgUrl: "",
              isQuestItem: isQuest,
              isProjectItem: isProject,
              isUpgradeItem: isUpgrade,
              isSafeToRecycle: isSafe,
              usedInQuests: [], // Simplified for performance
              usedInProjects: []
            };
          });

        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: processed }));
        setItems(processed);
      } catch (err: any) { console.error(err); } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  // --- Filtering ---
  const categories = useMemo(() => {
    const searchLower = search.toLowerCase();
    const filtered = items.filter(i => i.name.toLowerCase().includes(searchLower));

    return {
        QUEST: filtered.filter(i => i.isQuestItem),
        UPGRADE: filtered.filter(i => i.isUpgradeItem),
        PROJECT: filtered.filter(i => i.isProjectItem),
        RECYCLE: filtered.filter(i => i.isSafeToRecycle)
    };
  }, [items, search]);

  const goDetail = (item: ProcessedItem) => { setSelectedItem(item); setView('DETAIL'); window.scrollTo(0, 0); };
  const goCategory = (cat: CategoryType) => { setActiveCategory(cat); setView('CATEGORY'); window.scrollTo(0, 0); };
  const goHome = () => { setView('DASHBOARD'); setSelectedItem(null); setActiveCategory(null); window.scrollTo(0, 0); };

  const getRarityColor = (rarity: string) => {
    switch(rarity?.toLowerCase()) {
      case 'common': return '#e0e0e0';
      case 'uncommon': return '#4caf50';
      case 'rare': return '#2196f3';
      case 'epic': return '#9c27b0';
      case 'legendary': return '#ff9800';
      default: return '#e0e0e0';
    }
  };

  const s: { [key: string]: CSSProperties | ((arg: any) => CSSProperties) } = {
    app: { backgroundColor: '#050505', color: '#ccc', minHeight: '100vh', fontFamily: 'Inter, system-ui, sans-serif' },
    header: { backgroundColor: '#0a0a0a', borderBottom: '1px solid #222', padding: '0 40px', height: '80px', position: 'sticky', top: 0, zIndex: 100, display: 'flex', alignItems: 'center', justifyContent: 'space-between', boxShadow: '0 4px 20px rgba(0,0,0,0.5)' },
    logo: { color: '#ff9800', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '1px', cursor:'pointer' },
    raidToggle: (active: boolean) => ({ background: active ? '#ff9800' : '#333', width: 44, height: 24, borderRadius: 20, position:'relative', cursor:'pointer' }),
    search: { background:'#1a1a1a', border:'1px solid #333', color:'white', padding:'10px 15px', borderRadius:6, width:300 },
    main: { padding: '40px', maxWidth: '1600px', margin: '0 auto' },
    card: (rarity: string) => ({ backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', borderTop: `3px solid ${getRarityColor(rarity)}`, padding: '12px', cursor: 'pointer', minWidth: '200px', maxWidth: '200px', display: 'flex', flexDirection: 'column', height: '260px', flexShrink: 0 }),
    rowContainer: { display: 'flex', gap: '15px', overflowX: 'auto', paddingBottom: '20px', scrollbarWidth: 'thin' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: '20px' },
    sectionHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, marginTop:10 },
    seeAllBtn: { color:'#888', fontSize:'0.85rem', fontWeight:'bold', cursor:'pointer', border:'1px solid #333', padding:'6px 16px', borderRadius:20, transition:'0.2s', background:'transparent' }
  };

  const SectionRow = ({ title, cat, color }: { title: string, cat: CategoryType, color: string }) => {
    const data = categories[cat];
    if (data.length === 0) return null;
    return (
      <div style={{marginBottom: 50}}>
        <div style={s.sectionHeader as CSSProperties}>
            <h2 style={{margin:0, color:'white', fontSize:'1.4rem', borderLeft:`4px solid ${color}`, paddingLeft:15}}>
                {title} <span style={{fontSize:'0.6em', opacity:0.5, marginLeft:10}}>{data.length}</span>
            </h2>
            <button style={s.seeAllBtn as CSSProperties} onClick={() => goCategory(cat)} onMouseEnter={(e: SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = color; e.currentTarget.style.color = color; }} onMouseLeave={(e: SyntheticEvent<HTMLButtonElement>) => { e.currentTarget.style.borderColor = '#333'; e.currentTarget.style.color = '#888'; }}>SEE ALL →</button>
        </div>
        <div style={s.rowContainer as CSSProperties}>
            {data.slice(0, 10).map(item => (
                <div key={item.id} style={(s.card as Function)(item.rarity)} onClick={() => goDetail(item)}>
                    <div style={{height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #252525 0%, #111 70%)', borderRadius: '4px', marginBottom: '10px'}}>
                        <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                    </div>
                    <div style={{fontWeight:'700', color:'white', fontSize:'0.9rem', marginBottom:4, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis'}}>{item.name}</div>
                    <div style={{fontSize:'0.75rem', color:'#666'}}>{item.rarity}</div>
                    <div style={{marginTop:'auto', paddingTop:10, borderTop:'1px solid #222', display:'flex', justifyContent:'space-between', fontSize:'0.8rem'}}>
                         <span style={{color:color, fontWeight:'bold'}}>{title.split(' ')[0]}</span>
                         <span style={{color:'#888'}}>⛃ {item.sell_value}</span>
                    </div>
                </div>
            ))}
        </div>
      </div>
    );
  };

  if (loading) return <div style={{...s.app as CSSProperties, display:'flex', alignItems:'center', justifyContent:'center'}}><h2 style={{color:'#ff9800'}}>ANALYZING LOOT DATA...</h2></div>;

  return (
    <div style={s.app as CSSProperties}>
      <header style={s.header as CSSProperties}>
        <div style={{display:'flex', alignItems:'center', gap:30}} onClick={goHome}>
            <div style={s.logo as CSSProperties}>ARC RAIDERS WIKI</div>
            <div style={{display:'flex', alignItems:'center', gap:10, fontSize:'0.8rem', fontWeight:'bold', color:'#888', cursor:'default'}} onClick={e => e.stopPropagation()}>
                RAID MODE
                <div style={(s.raidToggle as Function)(raidMode)} onClick={() => setRaidMode(!raidMode)}>
                    <div style={{width:18, height:18, background:'white', borderRadius:'50%', position:'absolute', top:3, left: raidMode ? 23 : 3, transition:'0.2s'}} />
                </div>
            </div>
        </div>
        <input style={s.search as CSSProperties} placeholder="Search database..." value={search} onChange={e => setSearch(e.target.value)} />
      </header>

      <main style={s.main as CSSProperties}>
        {view === 'DETAIL' && selectedItem && (
          <div style={{maxWidth: 1000, margin: '0 auto'}}>
            <button onClick={() => { setView(activeCategory ? 'CATEGORY' : 'DASHBOARD'); }} style={{background:'transparent', border:'none', color:'#ff9800', cursor:'pointer', fontSize:'1rem', marginBottom: 20, fontWeight:'bold'}}>← BACK</button>
            <div style={{display:'flex', gap:30, marginBottom:40}}>
              <div style={{width:200, height:200, background:'#151515', border:`2px solid ${getRarityColor(selectedItem.rarity)}`, borderRadius:12, overflow:'hidden', display:'flex', alignItems:'center', justifyContent:'center'}}>
                 <ArcImage item={selectedItem} style={{width:'80%', height:'80%', objectFit:'contain'}} />
              </div>
              <div style={{flex:1}}>
                <h1 style={{margin:'0 0 10px 0', color:'white', fontSize:'3rem'}}>{selectedItem.name}</h1>
                <div style={{marginBottom: 20}}>
                   {selectedItem.isQuestItem && <span style={{padding:'4px 10px', borderRadius:4, fontSize:'0.8em', fontWeight:'bold', marginRight:10, background:'#222', color:'#b388ff', border:'1px solid #b388ff'}}>QUEST ITEM</span>}
                   {selectedItem.isUpgradeItem && <span style={{padding:'4px 10px', borderRadius:4, fontSize:'0.8em', fontWeight:'bold', marginRight:10, background:'#222', color:'#ffc107', border:'1px solid #ffc107'}}>UPGRADE PART</span>}
                   {selectedItem.isProjectItem && <span style={{padding:'4px 10px', borderRadius:4, fontSize:'0.8em', fontWeight:'bold', marginRight:10, background:'#222', color:'#2196f3', border:'1px solid #2196f3'}}>PROJECT ITEM</span>}
                   {selectedItem.isSafeToRecycle && <span style={{padding:'4px 10px', borderRadius:4, fontSize:'0.8em', fontWeight:'bold', marginRight:10, background:'#222', color:'#ff5252', border:'1px solid #ff5252'}}>SAFE TO RECYCLE</span>}
                </div>
                <p style={{color:'#ccc', fontSize:'1.1rem', lineHeight:1.6}}>{selectedItem.description}</p>
                <div style={{marginTop:30, display:'flex', gap:40, borderTop:'1px solid #333', paddingTop:20}}>
                    <div><div style={{color:'#666', fontSize:'0.8rem'}}>WEIGHT</div><div style={{color:'white', fontSize:'1.2rem'}}>{selectedItem.weight}kg</div></div>
                    <div><div style={{color:'#666', fontSize:'0.8rem'}}>STACK</div><div style={{color:'white', fontSize:'1.2rem'}}>{selectedItem.max_stack_size}</div></div>
                    <div><div style={{color:'#666', fontSize:'0.8rem'}}>VALUE</div><div style={{color:'#ff9800', fontSize:'1.2rem'}}>{selectedItem.sell_value}</div></div>
                </div>
              </div>
            </div>
          </div>
        )}
        {view === 'CATEGORY' && activeCategory && (
          <div>
             <button onClick={goHome} style={{background:'transparent', border:'none', color:'#ff9800', cursor:'pointer', fontSize:'1rem', marginBottom: 20, fontWeight:'bold'}}>← BACK TO DASHBOARD</button>
             <h1 style={{color:'white', marginBottom:30}}>{activeCategory} ITEMS <span style={{opacity:0.5, fontSize:'0.5em'}}>{categories[activeCategory].length}</span></h1>
             <div style={s.grid as CSSProperties}>
                {categories[activeCategory].map(item => (
                    <div key={item.id} style={(s.card as Function)(item.rarity)} onClick={() => goDetail(item)}>
                        <div style={{height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #252525 0%, #111 70%)', borderRadius: '4px', marginBottom: '10px'}}>
                            <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                        </div>
                        <div style={{fontWeight:'700', color:'white', fontSize:'0.9rem', marginBottom:4}}>{item.name}</div>
                        <div style={{fontSize:'0.75rem', color:'#666'}}>{item.rarity}</div>
                        <div style={{marginTop:'auto', paddingTop:10, borderTop:'1px solid #222', display:'flex', justifyContent:'space-between', fontSize:'0.8rem'}}>
                            <span style={{color:'#888'}}>⛃ {item.sell_value}</span>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        )}
        {view === 'DASHBOARD' && (
          <>
            <SectionRow title="KEEP FOR QUESTS" cat="QUEST" color="#b388ff" />
            <SectionRow title="WORKSHOP UPGRADES" cat="UPGRADE" color="#ffc107" />
            <SectionRow title="KEEP FOR PROJECTS" cat="PROJECT" color="#2196f3" />
            <SectionRow title="SAFE TO RECYCLE" cat="RECYCLE" color="#ff5252" />
          </>
        )}
      </main>
    </div>
  );
}

export default App;
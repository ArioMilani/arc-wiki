import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties, MouseEvent as ReactMouseEvent, ReactNode } from 'react';

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
  // These flags are required for the categories to work
  isQuestItem: boolean;
  isProjectItem: boolean;
  isUpgradeItem: boolean;
  isSafeToRecycle: boolean;
  // Connection data
  craftedBy?: any;
  usedInCrafting: any[];
  usedInUpgrades: any[];
}

type ViewState = 'DASHBOARD' | 'CATEGORY' | 'DETAIL';
type CategoryType = 'QUEST' | 'PROJECT' | 'UPGRADE' | 'RECYCLE';
type SortOption = 'Name' | 'Value (High)' | 'Value (Low)' | 'Rarity (High)' | 'Rarity (Low)' | 'Efficiency';

const CACHE_KEY = 'arc_wiki_v40_real_repo_data'; 

// --- LOGIC HELPERS ---

// 1. Truth Table for Categorization (Matches your Cheat Sheet)
const OVERRIDES = {
    QUEST: ["Adrenaline", "Unique Uplink", "Drone Tool", "Barricade", "Camera Lens", "Antiseptic", "Standard Core", "Syringe", "Surge Splint", "Thumper", "Optics Package", "Data Drive", "Memory Chip", "Gyroscope"],
    PROJECT: ["Advanced ARC", "Compact Power", "Magnetic Stabilizer", "Cluster Module", "Advanced Electrical", "Modulator", "Sensors", "Cooling Fan", "Battery", "Light Bulb", "Electrical Component", "Wire", "Durable Cloth", "Steel Cabling", "ARC Alloy", "Rubber Parts", "Hard Plastic", "Transformer", "Ball Bearing"],
    UPGRADE: ["Angled Grip", "Muzzle", "Scope", "Stock", "Receiver", "Barrel", "Magazine", "Tweezers", "Blood Bag", "Monitor", "Pills", "Chemicals", "Gas Canister", "Spark Plug", "Fuse", "Bottle", "Gunpowder", "Igniter", "Cable", "Screen", "Lens", "Circuit", "Resin", "Canister", "Filter", "Toolbox", "Drill", "Fruit", "Vegetable", "Food", "Water", "Seed", "Tape", "Glue", "Fabric", "Metal Sheet", "Anvil"]
};

const checkCategory = (name: string, list: string[]) => list.some(keyword => name.toLowerCase().includes(keyword.toLowerCase()));

const RARITY_WEIGHT: Record<string, number> = { 'common': 1, 'uncommon': 2, 'rare': 3, 'epic': 4, 'legendary': 5 };

// 2. Universal ID Normalizer (Fixes "Anvil I" vs "Anvil_1" mismatch)
const norm = (str: string) => {
    if (!str) return "";
    return String(str).toLowerCase().replace(/[^a-z0-9]/g, '');
};

// 3. Safe Fetch Wrapper
const fetchJson = async (url: string) => {
    try {
        const res = await fetch(url);
        if (!res.ok) return [];
        const data = await res.json();
        return Array.isArray(data) ? data : [];
    } catch {
        return [];
    }
};

// --- COMPONENTS ---

// 1. ARC IMAGE
const ArcImage = ({ item, style }: { item: ProcessedItem | { id: string, name: string }, style?: CSSProperties }) => {
  const BASE_URL = "https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/images/items";
  const [loadState, setLoadState] = useState<'primary' | 'fallback' | 'error'>('primary');
  
  const safeId = typeof item === 'string' ? item : item.id;
  const safeName = typeof item === 'string' ? item : item.name;

  useEffect(() => { setLoadState('primary'); }, [safeId]);

  const handleError = () => {
      if (loadState === 'primary') setLoadState('fallback');
      else if (loadState === 'fallback') setLoadState('error');
  };

  if (loadState === 'error') return <div style={{...style, display:'flex', alignItems:'center', justifyContent:'center', background:'#1a1a1a', borderRadius:4}}><span style={{fontSize:'1.5rem', opacity:0.2}}>📦</span></div>;

  const url = loadState === 'primary' ? `${BASE_URL}/${safeId}.png` : `${BASE_URL}/${safeId.replace(/ /g, '_')}.png`;
  return <img src={url} alt={safeName} style={style} onError={handleError} loading="lazy" />;
};

// 2. MINI ITEM CARD
const MiniCard = ({ id, label, allItems, onClick }: { id: string, label?: string, allItems: ProcessedItem[], onClick: (i: ProcessedItem) => void }) => {
    const targetId = norm(id);
    const item = allItems.find(i => norm(i.id) === targetId);
    
    if (!item) return null;

    return (
        <div 
            onClick={() => onClick(item)}
            style={{
                background: '#111', border: '1px solid #222', borderRadius: 8, padding: 12, cursor: 'pointer', transition: '0.2s',
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center', minWidth: 100
            }}
        >
            <div style={{height: 60, width: 60, display:'flex', alignItems:'center', justifyContent:'center', background: 'radial-gradient(circle, #222 0%, #111 70%)', borderRadius:4, marginBottom: 8}}>
                <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
            </div>
            <div style={{color: 'white', fontSize: '0.8rem', fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis', width: '100%'}}>{item.name}</div>
            {label && <div style={{fontSize: '0.7rem', color: '#666', fontWeight: 600, marginTop: 2}}>{label}</div>}
        </div>
    );
};

// 3. CUSTOM DROPDOWN
const CustomSelect = ({ value, onChange }: { value: SortOption, onChange: (val: SortOption) => void }) => {
    const [isOpen, setIsOpen] = useState(false);
    const options: SortOption[] = ['Name', 'Value (High)', 'Value (Low)', 'Rarity (High)', 'Rarity (Low)', 'Efficiency'];
    const wrapperRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const handleClickOutside = (event: any) => {
            if (wrapperRef.current && !wrapperRef.current.contains(event.target)) setIsOpen(false);
        };
        document.addEventListener("mousedown", handleClickOutside);
        return () => document.removeEventListener("mousedown", handleClickOutside);
    }, []);

    return (
        <div ref={wrapperRef} style={{position:'relative', fontSize:'0.75rem', fontWeight:'bold', color:'#ccc'}}>
            <div onClick={() => setIsOpen(!isOpen)} style={{background:'#151515', border: isOpen ? '1px solid #ff9800' : '1px solid #333', borderRadius:4, padding:'6px 12px', cursor:'pointer', display:'flex', alignItems:'center', gap:10, minWidth:120, justifyContent:'space-between'}}>
                {value} <span style={{fontSize:'0.6em', transform: isOpen ? 'rotate(180deg)' : 'rotate(0deg)', transition:'0.2s'}}>▼</span>
            </div>
            {isOpen && (
                <div style={{position:'absolute', top:'110%', left:0, right:0, background:'#151515', border:'1px solid #333', borderRadius:4, zIndex:1000, boxShadow:'0 10px 30px rgba(0,0,0,0.8)', overflow:'hidden'}}>
                    {options.map(opt => (
                        <div key={opt} onClick={() => { onChange(opt); setIsOpen(false); }} onMouseEnter={(e) => e.currentTarget.style.background = '#222'} onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'} style={{padding:'8px 12px', cursor:'pointer', color: value === opt ? '#ff9800' : '#888'}}>
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// 4. DRAGGABLE CAROUSEL ROW
const DraggableRow = ({ children }: { children: ReactNode }) => {
    const ref = useRef<HTMLDivElement>(null);
    const [isDown, setIsDown] = useState(false);
    const [startX, setStartX] = useState(0);
    const [scrollLeft, setScrollLeft] = useState(0);
    const [isDragging, setIsDragging] = useState(false);

    const onMouseDown = (e: ReactMouseEvent) => {
        if (!ref.current) return;
        setIsDown(true);
        setIsDragging(false);
        setStartX(e.pageX - ref.current.offsetLeft);
        setScrollLeft(ref.current.scrollLeft);
    };

    const onMouseUp = () => { setIsDown(false); setTimeout(() => setIsDragging(false), 0); };
    const onMouseLeave = () => { setIsDown(false); setIsDragging(false); };
    const onMouseMove = (e: ReactMouseEvent) => {
        if (!isDown || !ref.current) return;
        e.preventDefault();
        const x = e.pageX - ref.current.offsetLeft;
        const walk = (x - startX) * 1.5; 
        if (Math.abs(walk) > 5) setIsDragging(true);
        ref.current.scrollLeft = scrollLeft - walk;
    };
    const onCaptureClick = (e: ReactMouseEvent) => { if (isDragging) { e.stopPropagation(); e.preventDefault(); } };

    return (
        <div ref={ref} onMouseDown={onMouseDown} onMouseLeave={onMouseLeave} onMouseUp={onMouseUp} onMouseMove={onMouseMove} onClickCapture={onCaptureClick} style={{display: 'flex', gap: '30px', overflowX: 'auto', paddingBottom: '20px', cursor: isDown ? 'grabbing' : 'grab', scrollbarWidth: 'none'}} className="no-scrollbar">
            {children}
            <style>{`.no-scrollbar::-webkit-scrollbar { display: none; }`}</style>
        </div>
    );
};

// --- MAIN APP ---

function App() {
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [rawProjects, setRawProjects] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProcessedItem | null>(null);
  
  const [search, setSearch] = useState("");
  const [raidMode, setRaidMode] = useState(false);
  const [activeTab, setActiveTab] = useState<'ITEMS' | 'QUESTS'>('ITEMS');
  const [sortBy, setSortBy] = useState<SortOption>('Name');

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
        localStorage.removeItem(CACHE_KEY); 

        // 1. Fetch Items List (Real Repo)
        const itemsListRes = await fetch("https://api.github.com/repos/RaidTheory/arcraiders-data/contents/items");
        const itemsList = await itemsListRes.json();
        
        // 2. Fetch Projects (For Crafting/Upgrades)
        const projectsData = await fetchJson("https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/projects.json");
        setRawProjects(projectsData);

        // 3. Fetch Details for ALL Items (Chunked to handle rate limits slightly better)
        const rawItems: any[] = [];
        if (Array.isArray(itemsList)) {
            // Fetch in chunks of 50 to prevent browser stalling
            const chunkSize = 50;
            for (let i = 0; i < itemsList.length; i += chunkSize) {
                const chunk = itemsList.slice(i, i + chunkSize);
                const chunkPromises = chunk.map((file: any) => 
                    fetch(file.download_url)
                        .then(res => res.json())
                        // Store filename as backup ID
                        .then(data => ({ ...data, _fileNameId: file.name.replace('.json', '') }))
                        .catch(() => null)
                );
                const chunkResults = await Promise.all(chunkPromises);
                rawItems.push(...chunkResults.filter(r => r));
            }
        }

        // 4. Process & Link (The Magic Step)
        const processed = rawItems.map((item: any) => {
            const name = getText(item.name);
            // Prioritize filename as ID because it's usually cleaner than internal IDs
            const safeId = String(item._fileNameId || item.id || "unknown");
            
            // Apply Truth Table Logic
            const isQuest = checkCategory(name, OVERRIDES.QUEST);
            const isProject = !isQuest && checkCategory(name, OVERRIDES.PROJECT);
            const isUpgrade = !isQuest && !isProject && checkCategory(name, OVERRIDES.UPGRADE);
            const isSafe = !isQuest && !isProject && !isUpgrade;

            return {
              id: safeId, 
              name: name, 
              rarity: item.rarity || 'Common', 
              type: item.type || 'Material',
              description: getText(item.description), 
              weight: Number(item.weight) || 0, 
              max_stack_size: Number(item.max_stack_size) || 1,
              sell_value: Number(item.sell_value) || 0, 
              imgUrl: "",
              // Logic Flags
              isQuestItem: isQuest, 
              isProjectItem: isProject, 
              isUpgradeItem: isUpgrade, 
              isSafeToRecycle: isSafe,
              // Data
              usedInCrafting: [],
              usedInUpgrades: []
            };
          });

        setItems(processed);
      } catch (err) { console.error(err); } finally { setLoading(false); }
    };
    fetchData();
  }, []);

  // --- DETAIL VIEW LOGIC (Computed on fly) ---
  const itemDetails = useMemo(() => {
    if (!selectedItem) return null;
    const targetId = norm(selectedItem.id);
    
    // 1. Crafting Recipe (Find project where Yield matches Item)
    const craftedBy = rawProjects.find(p => p.yield && p.yield.some((y: any) => norm(y.item) === targetId));

    // 2. Used In (Find project where Cost matches Item)
    const usedIn = rawProjects.filter(p => p.cost && p.cost.some((c: any) => norm(c.item) === targetId));
    
    // Split 'Used In' into Upgrades vs General Crafting
    const usedInUpgrades = usedIn.filter(p => p.name && (p.name.toLowerCase().includes('upgrade') || p.name.toLowerCase().includes('station')));
    const usedInCrafting = usedIn.filter(p => !usedInUpgrades.includes(p));

    return { craftedBy, usedInCrafting, usedInUpgrades };
  }, [selectedItem, rawProjects]);

  // --- CATEGORY FILTERING ---
  const categories = useMemo(() => {
    let filtered = items.filter(i => i.name.toLowerCase().includes(search.toLowerCase()));
    filtered.sort((a, b) => {
        if (sortBy === 'Value (High)') return b.sell_value - a.sell_value;
        if (sortBy === 'Value (Low)') return a.sell_value - b.sell_value;
        if (sortBy === 'Rarity (High)') return (RARITY_WEIGHT[b.rarity.toLowerCase()] || 0) - (RARITY_WEIGHT[a.rarity.toLowerCase()] || 0);
        if (sortBy === 'Rarity (Low)') return (RARITY_WEIGHT[a.rarity.toLowerCase()] || 0) - (RARITY_WEIGHT[b.rarity.toLowerCase()] || 0);
        if (sortBy === 'Efficiency') return (b.sell_value / (b.weight||1)) - (a.sell_value / (a.weight||1));
        return a.name.localeCompare(b.name);
    });
    return {
        QUEST: filtered.filter(i => i.isQuestItem),
        UPGRADE: filtered.filter(i => i.isUpgradeItem),
        PROJECT: filtered.filter(i => i.isProjectItem),
        RECYCLE: filtered.filter(i => i.isSafeToRecycle)
    };
  }, [items, search, sortBy]);

  const goDetail = (item: ProcessedItem) => { setSelectedItem(item); setView('DETAIL'); window.scrollTo(0, 0); };
  const goCategory = (cat: CategoryType | null) => { 
      if (cat === null) { setView('DASHBOARD'); setActiveCategory(null); } 
      else { setActiveCategory(cat); setView('CATEGORY'); }
      window.scrollTo(0, 0); 
  };

  const getRarityColor = (rarity: string) => {
    switch(rarity?.toLowerCase()) {
      case 'common': return '#e0e0e0'; case 'uncommon': return '#4caf50'; case 'rare': return '#2196f3';
      case 'epic': return '#9c27b0'; case 'legendary': return '#ff9800'; default: return '#e0e0e0';
    }
  };

  // --- STYLES ---
  const s = {
    app: { backgroundColor: '#050505', color: '#ccc', minHeight: '100vh', fontFamily: '"Inter", sans-serif', display:'flex', flexDirection:'column' as const },
    header: { backgroundColor: '#090909', borderBottom: '1px solid #1a1a1a', position: 'sticky' as const, top: 0, zIndex: 100 },
    headerInner: { maxWidth: '1600px', margin: '0 auto', padding: '0 40px' },
    topRowOuter: { backgroundColor: '#090909', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'center' },
    filterRowOuter: { backgroundColor: '#090909', borderBottom: '1px solid #1a1a1a', display: 'flex', justifyContent: 'center' },
    headerContent: { width: '100%', maxWidth: '1600px', padding: '0 40px', boxSizing: 'border-box' as const },
    topRow: { height: '80px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    filterRow: { height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' },
    logo: { color: '#ff9800', fontWeight: 900, fontSize: '1.5rem', letterSpacing: '1px', cursor:'pointer' },
    raidMode: { display: 'flex', alignItems: 'center', gap: '10px', fontSize: '0.75rem', fontWeight: 700, color: '#666', letterSpacing: '1px' },
    raidToggle: (active: boolean): CSSProperties => ({ background: active ? '#ff9800' : '#333', width: 36, height: 20, borderRadius: 20, position:'relative', cursor:'pointer', transition: '0.2s' }),
    raidKnob: (active: boolean): CSSProperties => ({ width: 14, height: 14, background: 'white', borderRadius: '50%', position: 'absolute', top: 3, left: active ? 19 : 3, transition: '0.2s' }),
    searchContainer: { position:'relative' as const, width: 300 },
    searchIcon: { position:'absolute' as const, left:14, top:'50%', transform:'translateY(-50%)', width:16, height:16, fill:'#666' },
    searchInput: { background:'#151515', border:'1px solid #333', color:'white', padding:'10px 12px 10px 40px', borderRadius:6, width:'100%', fontSize:'0.9rem', outline:'none', transition:'0.2s', boxShadow: 'inset 0 2px 4px rgba(0,0,0,0.5)' },
    tabGroup: { background:'#151515', padding: 4, borderRadius: 6, display:'flex', gap:2, border:'1px solid #222' },
    tabBtn: (active: boolean): CSSProperties => ({ background: active ? '#ff9800' : 'transparent', color: active ? 'black' : '#666', border: 'none', padding: '6px 20px', borderRadius: 4, fontWeight: 700, fontSize: '0.8rem', cursor: 'pointer', transition:'0.2s' }),
    pillGroup: { display: 'flex', gap: '10px' },
    pill: (active: boolean, color: string = '#ff9800'): CSSProperties => ({ background: active ? color : 'transparent', color: active ? (color==='#ff9800'?'black':'white') : '#666', border: `1px solid ${active ? color : '#333'}`, padding: '6px 18px', borderRadius: 20, fontSize: '0.75rem', fontWeight: 700, cursor: 'pointer', transition: '0.2s' }),
    main: { padding: '40px', maxWidth: '1600px', margin: '0 auto', flex: 1, width:'100%', boxSizing:'border-box' as const },
    card: (rarity: string): CSSProperties => ({ backgroundColor: '#111', borderRadius: '8px', border: '1px solid #222', borderTop: `3px solid ${getRarityColor(rarity)}`, padding: '16px', cursor: 'pointer', minWidth: '240px', maxWidth: '240px', display: 'flex', flexDirection: 'column', height: '300px', flexShrink: 0, userSelect: 'none' }),
    rowContainer: { display: 'flex', gap: '30px', overflowX: 'auto', paddingBottom: '20px', scrollbarWidth: 'thin' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(240px, 1fr))', gap: '40px' },
    sectionHeader: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20, marginTop:10 },
    seeAllBtn: { color:'#666', fontSize:'0.75rem', fontWeight:'bold', cursor:'pointer', border:'1px solid #222', padding:'6px 14px', borderRadius:20, transition:'0.2s', background:'transparent' },
    footer: { borderTop:'1px solid #222', background:'#080808', padding:'40px 0', marginTop:'auto', textAlign:'center' as const, fontSize:'0.8rem', color:'#555' },
    sectionTitle: { color: '#ff9800', fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' as const, marginBottom: 15, paddingLeft: 10, borderLeft: '3px solid #ff9800' },
    miniGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(120px, 1fr))', gap: '15px' },
    empty: { color: '#444', fontStyle: 'italic', fontSize: '0.9rem' }
  };

  // --- SUB-COMPONENTS ---
  const SectionRow = ({ title, cat, color }: { title: string, cat: CategoryType, color: string }) => {
    const [hover, setHover] = useState(false);
    const data = categories[cat];
    if (data.length === 0) return null;
    return (
      <div style={{marginBottom: 60}} onMouseEnter={() => setHover(true)} onMouseLeave={() => setHover(false)}>
        <div style={{display:'flex', alignItems:'center', marginBottom:20, marginTop:10, gap:15}}>
            <h2 style={{margin:0, color:'white', fontSize:'1.2rem', borderLeft:`4px solid ${color}`, paddingLeft:15, fontWeight:800, textTransform:'uppercase'}}>
                {title} <span style={{fontSize:'0.8em', opacity:0.4, marginLeft:10}}>{data.length}</span>
            </h2>
            <button onClick={() => goCategory(cat)} style={{opacity: hover ? 1 : 0, transform: hover ? 'translateX(0)' : 'translateX(-10px)', transition: '0.2s', background:'transparent', border:`1px solid ${color}`, color: color, fontSize:'0.7rem', padding:'4px 12px', borderRadius:20, cursor:'pointer', fontWeight:'bold'}}>SEE ALL →</button>
        </div>
        <DraggableRow>
            {data.slice(0, 10).map(item => (
                <div key={item.id} style={s.card(item.rarity)} onClick={() => goDetail(item)}>
                    <div style={{height: '150px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #252525 0%, #111 70%)', borderRadius: '4px', marginBottom: '15px', pointerEvents:'none'}}>
                        <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                    </div>
                    <div style={{fontWeight:'700', color:'white', fontSize:'0.95rem', marginBottom:4, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap'}}>{item.name}</div>
                    <div style={{fontSize:'0.75rem', color:'#666'}}>{item.rarity}</div>
                    <div style={{marginTop:'auto', paddingTop:10, borderTop:'1px solid #222', display:'flex', justifyContent:'space-between', fontSize:'0.8rem'}}>
                         <span style={{color:color, fontWeight:'bold'}}>{title.split(' ')[0]}</span>
                         <span style={{color:'#888'}}>⛃ {item.sell_value}</span>
                    </div>
                </div>
            ))}
        </DraggableRow>
      </div>
    );
  };

  if (loading) return <div style={{...s.app, display:'flex', alignItems:'center', justifyContent:'center'}}><h2 style={{color:'#ff9800'}}>INITIALIZING...</h2></div>;

  return (
    <div style={s.app}>
      <header style={s.header}>
        <div style={s.topRowOuter}><div style={s.headerContent}><div style={s.topRow}>
            <div style={{display:'flex', alignItems:'center', gap:30}}><div style={s.logo} onClick={() => goCategory(null)}>ARC RAIDERS</div><div style={{width:1, height:20, background:'#222'}} /><div style={s.raidMode}>RAID MODE<div style={s.raidToggle(raidMode)} onClick={() => setRaidMode(!raidMode)}><div style={s.raidKnob(raidMode)} /></div></div></div>
            <div style={s.tabGroup}><button style={s.tabBtn(activeTab === 'ITEMS')} onClick={() => setActiveTab('ITEMS')}>ITEMS</button><button style={s.tabBtn(activeTab === 'QUESTS')} onClick={() => setActiveTab('QUESTS')}>QUESTS</button></div>
            <div style={s.searchContainer}><svg style={s.searchIcon} viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><input style={s.searchInput} placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div></div></div>
        <div style={s.filterRowOuter}><div style={s.headerContent}><div style={s.filterRow}>
            <div style={s.pillGroup}>
                <button style={s.pill(view === 'DASHBOARD', '#fff')} onClick={() => goCategory(null)}>All</button>
                <button style={s.pill(activeCategory === 'QUEST', '#b388ff')} onClick={() => goCategory('QUEST')}>Keep for Quests</button>
                <button style={s.pill(activeCategory === 'PROJECT', '#2196f3')} onClick={() => goCategory('PROJECT')}>Keep for Projects</button>
                <button style={s.pill(activeCategory === 'UPGRADE', '#ffc107')} onClick={() => goCategory('UPGRADE')}>Workshop Upgrades</button>
                <button style={s.pill(activeCategory === 'RECYCLE', '#ff5252')} onClick={() => goCategory('RECYCLE')}>Safe to Recycle</button>
            </div>
            <div style={{display:'flex', alignItems:'center', gap:20}}><div style={{display:'flex', alignItems:'center', gap:10, fontSize:'0.7rem', color:'#666', fontWeight:'bold'}}>MIN VALUE: 0 <input type="range" style={{width:60, accentColor:'#ff9800', height:4}} /></div><div style={{width:1, height:20, background:'#222'}} /><div style={{display:'flex', alignItems:'center', gap:10, fontSize:'0.75rem', fontWeight:'bold', color:'#666'}}>SORT <CustomSelect value={sortBy} onChange={setSortBy} /></div></div>
        </div></div></div>
      </header>

      <main style={s.main}>
        {view === 'DETAIL' && selectedItem && itemDetails ? (
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

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:40, marginTop:40}}>
                <div>
                    <div style={{marginBottom:30}}>
                         <div style={s.sectionTitle}>Crafting Recipe</div>
                         {itemDetails.craftedBy ? (
                             <div style={{background:'#151515', padding:15, borderRadius:8, border:'1px solid #222'}}>
                                <div style={{color:'white', fontWeight:'bold', marginBottom:10}}>{itemDetails.craftedBy.name}</div>
                                <div style={s.miniGrid}>
                                    {itemDetails.craftedBy.cost.map((ing: any, i: number) => (
                                        <MiniCard key={i} id={ing.item} label={`x${ing.count}`} allItems={items} onClick={goDetail} />
                                    ))}
                                </div>
                             </div>
                         ) : <div style={s.empty}>Cannot be crafted.</div>}
                    </div>
                </div>

                <div>
                    <div style={{marginBottom:30}}>
                         <div style={s.sectionTitle}>Used In Projects</div>
                         {itemDetails.usedInCrafting.length > 0 ? (
                             <div style={s.miniGrid}>
                                 {itemDetails.usedInCrafting.map((p: any, i:number) => <MiniCard key={i} id={p.yield?.[0]?.item || p.id} label={p.name} allItems={items} onClick={goDetail} />)}
                             </div>
                         ) : <div style={s.empty}>Not used in any projects.</div>}
                    </div>
                    <div>
                         <div style={{...s.sectionTitle, borderColor:'#ffc107', color:'#ffc107'}}>Used In Upgrades</div>
                         {itemDetails.usedInUpgrades.length > 0 ? (
                             <div style={s.miniGrid}>
                                 {itemDetails.usedInUpgrades.map((p: any, i:number) => (
                                     <div key={i} style={{background:'#111', padding:10, borderRadius:6, borderLeft:'3px solid #ffc107', color:'#ccc', fontSize:'0.8rem'}}>{p.name}</div>
                                 ))}
                             </div>
                         ) : <div style={s.empty}>Not used for upgrades.</div>}
                    </div>
                </div>
            </div>
          </div>
        ) : view === 'CATEGORY' && activeCategory ? (
          <div>
             <button onClick={() => goCategory(null)} style={{background:'transparent', border:'none', color:'#ff9800', cursor:'pointer', fontSize:'1rem', marginBottom: 20, fontWeight:'bold'}}>← BACK TO DASHBOARD</button>
             <h1 style={{color:'white', marginBottom:30, textTransform:'uppercase'}}>{activeCategory} <span style={{opacity:0.5, fontSize:'0.5em'}}>{categories[activeCategory].length}</span></h1>
             <div style={s.grid as CSSProperties}>
                {categories[activeCategory].map(item => (
                    <div key={item.id} style={s.card(item.rarity)} onClick={() => goDetail(item)}>
                        <div style={{height: '130px', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'radial-gradient(circle, #252525 0%, #111 70%)', borderRadius: '4px', marginBottom: '15px'}}>
                            <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                        </div>
                        <div style={{fontWeight:'700', color:'white', fontSize:'0.9rem', marginBottom:4}}>{item.name}</div>
                        <div style={{fontSize:'0.75rem', color:'#666'}}>{item.rarity}</div>
                        <div style={{marginTop:'auto', paddingTop:10, borderTop:'1px solid #222', display:'flex', justifyContent:'space-between', fontSize:'0.8rem', color:'#888'}}>
                            <span>⛃ {item.sell_value}</span>
                        </div>
                    </div>
                ))}
             </div>
          </div>
        ) : (
          <>
            <SectionRow title="KEEP FOR QUESTS" cat="QUEST" color="#b388ff" />
            <SectionRow title="WORKSHOP UPGRADES" cat="UPGRADE" color="#ffc107" />
            <SectionRow title="KEEP FOR PROJECTS" cat="PROJECT" color="#2196f3" />
            <SectionRow title="SAFE TO RECYCLE" cat="RECYCLE" color="#ff5252" />
          </>
        )}
      </main>
      <footer style={s.footer}><div style={{color:'#ff9800', fontWeight:900, fontSize:'1.2rem', marginBottom:10}}>ARC RAIDERS CHEAT SHEET</div><div style={{marginBottom:15}}>Fan-made companion app. Not affiliated with Embark Studios.</div><div style={{marginTop:20, fontSize:'0.7rem', opacity:0.4}}>Version 5.0 • Updated Dec 2025</div></footer>
    </div>
  );
}

export default App;
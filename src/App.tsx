import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';

// --- CONFIG ---
const API_BASE = "/api/arc-raiders"; 
const GITHUB_BASE = "https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main";
const CACHE_KEY = "arc_wiki_v24_COLOR_FIX"; 
const CACHE_EXPIRY = 3600 * 1000; // 1 Hour
const PLACEHOLDER_IMG = "https://placehold.co/400x400/1a1a1a/666666?text=No+Image";

// --- HELPERS ---
const toSnakeCase = (id: string) => id ? id.toLowerCase().replace(/-/g, '_') : '';
const safeNum = (val: any) => { const n = Number(val); return isNaN(n) ? 0 : n; };

// --- INTERFACES (API) ---
interface RawApiItem {
    id: string;
    name: string;
    description?: string;
    value?: number | string; 
    rarity?: string; 
    type?: string; 
    icon?: string; 
    stat_block?: { weight?: number | string; stackSize?: number | string; };
}

interface RawApiQuest {
    id: string;
    name: string;
    trader: string;
    description: string;
    requirements?: any[];
    rewards?: any[];
}

// --- INTERFACES (GITHUB) ---
interface GhDetailItem {
    id: string;
    recipe?: Record<string, number>; 
    recycling?: Record<string, number>; 
    recyclesInto?: Record<string, number>; 
    craftBench?: string;
    [key: string]: any;
}

interface GhTrade {
    itemId: string; 
    cost?: { itemId: string; quantity: number }; 
    trader?: string; 
}

interface GhProject {
    id: string;
    name: string;
    cost: { item: string; count: number }[] | Record<string, number>;
}

// --- INTERNAL STATE ---
interface Ingredient {
    id: string;
    count: number;
}

interface GlobalGraph {
    soldBy: Map<string, string>; 
    usedInProjects: Map<string, string[]>; 
}

interface ProcessedItem {
    id: string;
    name: string;
    description: string;
    rarity: string;
    type: string;
    weight: number;
    max_stack_size: number;
    sell_value: number;
    imageUrl: string; 
    
    soldBy: string | null;
    craftedAt: string | null;
    computedIngredients: Ingredient[];
    computedRecyclesInto: Ingredient[];
    computedUsedInProjects: string[]; 
    computedRelatedQuests: RawApiQuest[];

    isQuestItem: boolean;
    isProjectItem: boolean;
    isUpgradeItem: boolean;
    isSafeToRecycle: boolean;
}

type ViewState = 'DASHBOARD' | 'CATEGORY' | 'DETAIL';
type CategoryType = 'QUEST' | 'PROJECT' | 'UPGRADE' | 'RECYCLE';
type SortOption = 'Name' | 'Value (High)' | 'Value (Low)' | 'Rarity (High)' | 'Rarity (Low)' | 'Efficiency';

// --- GLOBAL HELPERS (UI) ---
const RARITY_WEIGHT: Record<string, number> = { 'common': 1, 'standard': 1, 'uncommon': 2, 'rare': 3, 'epic': 4, 'legendary': 5 };

const getRarityColor = (rarity: string) => {
    switch(rarity?.toLowerCase()) {
      case 'common': case 'standard': return '#e0e0e0'; 
      case 'uncommon': return '#4caf50'; 
      case 'rare': return '#2196f3';
      case 'epic': return '#9c27b0'; 
      case 'legendary': return '#ff9800'; 
      default: return '#e0e0e0';
    }
};

const getCategoryColor = (cat: CategoryType | null) => {
    switch(cat) {
        case 'QUEST': return '#b388ff';
        case 'UPGRADE': return '#ffc107';
        case 'PROJECT': return '#2196f3';
        case 'RECYCLE': return '#ff5252';
        default: return '#e0e0e0';
    }
};

// --- DATA NORMALIZERS ---

const normalizeItem = (raw: RawApiItem, graph: GlobalGraph): ProcessedItem => {
    return {
        id: raw.id,
        name: raw.name,
        description: raw.description || "No description available.",
        rarity: raw.rarity || "Standard",
        type: raw.type || "Item",
        
        weight: safeNum(raw.stat_block?.weight),
        max_stack_size: safeNum(raw.stat_block?.stackSize || 1),
        sell_value: safeNum(raw.value),
        imageUrl: raw.icon || "", 

        soldBy: graph.soldBy.get(raw.id) || null,
        computedUsedInProjects: graph.usedInProjects.get(raw.id) || [],

        craftedAt: null,
        computedIngredients: [],
        computedRecyclesInto: [],
        computedRelatedQuests: [],

        isQuestItem: false,
        isProjectItem: false, 
        isUpgradeItem: false,
        isSafeToRecycle: true
    };
};

const normalizeDetailItem = (base: ProcessedItem, ghData: GhDetailItem): ProcessedItem => {
    const recipeObj = ghData.recipe || {};
    const ingredients: Ingredient[] = Object.entries(recipeObj).map(([id, count]) => ({
        id: toSnakeCase(id),
        count: Number(count)
    }));

    const recycleObj = ghData.recyclesInto || ghData.recycling || {};
    const recycling: Ingredient[] = Object.entries(recycleObj).map(([id, count]) => ({
        id: toSnakeCase(id),
        count: Number(count)
    }));

    return {
        ...base,
        craftedAt: ghData.craftBench || base.soldBy || null,
        computedIngredients: ingredients,
        computedRecyclesInto: recycling,
        isProjectItem: ingredients.length > 0 || base.isProjectItem,
        isSafeToRecycle: recycling.length > 0 && !base.isQuestItem && !base.isUpgradeItem && !base.isProjectItem
    };
};

// --- DATA SERVICE ---

const apiService = {
    async fetchAll() {
        console.log("🌐 Fetching API & Global Static Data...");

        // 1. API Fetcher (Resilient to 500 Errors)
        const fetchApiList = async (endpoint: string) => {
            let allResults: any[] = [];
            let page = 1;
            while (page < 50) {
                try {
                    const res = await fetch(`${API_BASE}/${endpoint}?page=${page}&limit=100`);
                    
                    if (res.status === 500) {
                        console.warn(`⚠️ API ${endpoint} Page ${page} returned 500. Stopping fetch gracefully.`);
                        break; 
                    }
                    
                    if (!res.ok) break;
                    const json = await res.json();
                    let data = Array.isArray(json) ? json : (json.data || []);
                    if (data.length === 0) break;
                    allResults = [...allResults, ...data];
                    page++;
                } catch (e) { 
                    console.warn(`Fetch error on ${endpoint} page ${page}`, e);
                    break; 
                }
            }
            return allResults;
        };

        // 2. GitHub Static Fetcher
        const fetchStatic = async (file: string) => {
            try {
                const res = await fetch(`${GITHUB_BASE}/${file}`);
                if (!res.ok) return [];
                return await res.json();
            } catch (e) { return []; }
        };

        const [items, quests, trades, projects] = await Promise.all([
            fetchApiList('items'),
            fetchApiList('quests'),
            fetchStatic('trades.json'),
            fetchStatic('projects.json')
        ]);

        return { items, quests, trades, projects };
    },

    async fetchGithubDetail(id: string): Promise<GhDetailItem | null> {
        const snakeId = toSnakeCase(id);
        const url = `${GITHUB_BASE}/items/${snakeId}.json`;
        console.log(`🔎 JIT Fetching GitHub Detail: ${url}`);
        try {
            const res = await fetch(url);
            if (!res.ok) return null;
            return await res.json();
        } catch (e) {
            return null;
        }
    }
};

// --- COMPONENTS ---

const ArcImage = ({ item, style }: { item: ProcessedItem, style?: CSSProperties }) => {
    const [hasError, setHasError] = useState(false);
    useEffect(() => { setHasError(false); }, [item.id]);
    let src = item.imageUrl;
    if (!src || hasError) src = PLACEHOLDER_IMG;
    return <img src={src} alt={item.name} style={style} onError={() => setHasError(true)} loading="lazy" />;
};

const MiniCard = ({ id, label, allItems, onClick }: { id: string, label?: string, allItems: ProcessedItem[], onClick: (i: ProcessedItem) => void }) => {
    const item = allItems.find(i => 
        i.id === id || 
        toSnakeCase(i.id) === toSnakeCase(id) ||
        i.name.toLowerCase() === id.toLowerCase().replace(/_/g, ' ')
    );

    if (!item) return (
        <div className="mini-card-missing">
             <div className="mini-title-missing">{id}</div>
             {label && <div className="mini-sub">{label}</div>}
        </div>
    );
    return (
        <div onClick={() => onClick(item)} className="mini-card">
            <div className="mini-img"><ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} /></div>
            <div className="mini-title">{item.name}</div>
            {label && <div className="mini-sub">{label}</div>}
        </div>
    );
};

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
        <div ref={wrapperRef} className="custom-select">
            <div onClick={() => setIsOpen(!isOpen)} className={`select-trigger ${isOpen ? 'open' : ''}`}>{value} <span className="select-arrow">▼</span></div>
            {isOpen && <div className="select-options">{options.map((opt: SortOption) => (<div key={opt} onClick={() => { onChange(opt); setIsOpen(false); }} className={`option ${value === opt ? 'selected' : ''}`}>{opt}</div>))}</div>}
        </div>
    );
};

// --- MAIN APP ---

function App() {
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [loading, setLoading] = useState(true);
  
  // Detail State
  const [selectedItem, setSelectedItem] = useState<ProcessedItem | null>(null); 
  const [detailItem, setDetailItem] = useState<ProcessedItem | null>(null); 
  const [isDetailLoading, setIsDetailLoading] = useState(false);

  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('Name');

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        const { items: rawItems, quests, trades, projects } = await apiService.fetchAll();

        // 1. Build Global Graph
        const graph: GlobalGraph = {
            soldBy: new Map(),
            usedInProjects: new Map()
        };

        if (Array.isArray(trades)) {
            trades.forEach((t: GhTrade) => {
                if (t.itemId && t.trader) {
                    graph.soldBy.set(t.itemId, t.trader);
                }
            });
        }

        if (Array.isArray(projects)) {
            projects.forEach((p: GhProject) => {
                const costs = Array.isArray(p.cost) ? p.cost : []; 
                // Handle dict structure if necessary
                if (!Array.isArray(p.cost) && p.cost) {
                    Object.keys(p.cost).forEach(key => {
                        const list = graph.usedInProjects.get(key) || [];
                        if (!list.includes(p.name)) list.push(p.name);
                        graph.usedInProjects.set(key, list);
                    });
                } else {
                    costs.forEach(c => {
                        const list = graph.usedInProjects.get(c.item) || [];
                        if (!list.includes(p.name)) list.push(p.name);
                        graph.usedInProjects.set(c.item, list);
                    });
                }
            });
        }

        // 2. Normalize Items
        const processed: ProcessedItem[] = rawItems.map((item: RawApiItem) => normalizeItem(item, graph));

        // 3. Link Quests & Flags
        processed.forEach(item => {
            item.computedRelatedQuests = quests.filter((q: RawApiQuest) => JSON.stringify(q).includes(`"${item.id}"`));
            item.isQuestItem = item.computedRelatedQuests.length > 0;
            item.isUpgradeItem = item.computedUsedInProjects.some(name => name.toLowerCase().includes('upgrade') || name.toLowerCase().includes('module'));
        });

        setItems(processed);
        setLoading(false);
    };
    init();
  }, []);

  // --- NAVIGATION & JIT FETCH ---
  const goDetail = async (item: ProcessedItem) => {
      setSelectedItem(item);
      setDetailItem(null);
      setView('DETAIL');
      window.scrollTo(0, 0);

      setIsDetailLoading(true);
      const ghDetail = await apiService.fetchGithubDetail(item.id);
      
      if (ghDetail) {
          const enriched = normalizeDetailItem(item, ghDetail);
          setDetailItem(enriched);
      } else {
          setDetailItem(item);
      }
      setIsDetailLoading(false);
  };

  const goCategory = (cat: CategoryType | null) => { 
      if (cat === null) { setView('DASHBOARD'); setActiveCategory(null); } 
      else { setActiveCategory(cat); setView('CATEGORY'); }
      window.scrollTo(0, 0); 
  };

  // --- UI HELPERS ---
  const categories = useMemo(() => {
    let filtered = items.filter((i) => i.name.toLowerCase().includes(search.toLowerCase()));
    const getRarityWeight = (r: string) => RARITY_WEIGHT[r.toLowerCase()] || 0;
    filtered.sort((a, b) => {
        if (sortBy === 'Value (High)') return b.sell_value - a.sell_value;
        if (sortBy === 'Value (Low)') return a.sell_value - b.sell_value;
        if (sortBy === 'Rarity (High)') return getRarityWeight(b.rarity) - getRarityWeight(a.rarity);
        if (sortBy === 'Rarity (Low)') return getRarityWeight(a.rarity) - getRarityWeight(b.rarity);
        if (sortBy === 'Efficiency') return (b.sell_value / (b.weight||1)) - (a.sell_value / (a.weight||1));
        return a.name.localeCompare(b.name);
    });
    return {
        QUEST: filtered.filter((i) => i.isQuestItem),
        UPGRADE: filtered.filter((i) => i.isUpgradeItem),
        PROJECT: filtered.filter((i) => i.isProjectItem),
        RECYCLE: filtered.filter((i) => i.isSafeToRecycle)
    };
  }, [items, search, sortBy]);

  const SectionRow = ({ title, cat, color }: { title: string, cat: CategoryType, color: string }) => {
    const data = categories[cat];
    if (data.length === 0) return null;
    return (
      <div className="section-container">
        <div className="section-header">
            <h2 className="section-title" style={{ borderLeftColor: color }}>{title} <span className="count-badge">{data.length}</span></h2>
            <button onClick={() => goCategory(cat)} className="see-all-btn" style={{ borderColor: color, color: color }}>SEE ALL →</button>
        </div>
        <div className="carousel">
            {data.slice(0, 10).map((item) => (
                <div key={item.id} className="item-card" style={{ borderTopColor: getRarityColor(item.rarity) }} onClick={() => goDetail(item)}>
                    <div className="card-img-container"><ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} /></div>
                    <div className="card-name">{item.name}</div>
                    <div className="card-rarity">{item.rarity}</div>
                    <div className="card-footer"><span style={{color:color, fontWeight:'bold'}}>{cat}</span><span className="card-value">⛃ {item.sell_value}</span></div>
                </div>
            ))}
        </div>
      </div>
    );
  };

  // --- RENDER ---
  if (loading) return <div className="loading-screen"><h2 style={{color:'var(--c-orange)'}}>INITIALIZING DATA...</h2></div>;

  const activeItem = detailItem || selectedItem;

  return (
    <div className="app-container">
      <header className="header">
        <div className="header-row-outer top-row"><div className="header-content">
            <div className="controls-left"><div className="logo" onClick={() => goCategory(null)}>ARC RAIDERS WIKI</div></div>
            <div className="search-container"><svg className="search-icon" viewBox="0 0 24 24"><path d="M15.5 14h-.79l-.28-.27C15.41 12.59 16 11.11 16 9.5 16 5.91 13.09 3 9.5 3S3 5.91 3 9.5 5.91 16 9.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/></svg><input className="search-input" placeholder="Search items..." value={search} onChange={e => setSearch(e.target.value)} /></div>
        </div></div>
        <div className="header-row-outer filter-row"><div className="header-content">
            <div className="pill-group">
                <button className={`pill all ${view === 'DASHBOARD' ? 'active' : ''}`} onClick={() => goCategory(null)}>All</button>
                <button className={`pill quest ${activeCategory === 'QUEST' ? 'active' : ''}`} onClick={() => goCategory('QUEST')}>Keep for Quests</button>
                <button className={`pill project ${activeCategory === 'PROJECT' ? 'active' : ''}`} onClick={() => goCategory('PROJECT')}>Keep for Projects</button>
                <button className={`pill upgrade ${activeCategory === 'UPGRADE' ? 'active' : ''}`} onClick={() => goCategory('UPGRADE')}>Workshop Upgrades</button>
                <button className={`pill recycle ${activeCategory === 'RECYCLE' ? 'active' : ''}`} onClick={() => goCategory('RECYCLE')}>Safe to Recycle</button>
            </div>
            <div className="controls-right"><span>SORT <CustomSelect value={sortBy} onChange={setSortBy} /></span></div>
        </div></div>
      </header>

      <main className="main-content">
        {view === 'DETAIL' && activeItem ? (
          <div className="detail-container">
            <button onClick={() => { setView(activeCategory ? 'CATEGORY' : 'DASHBOARD'); }} className="back-btn">← BACK</button>
            <div className="detail-header">
              <div className="detail-img-box" style={{ borderColor: getRarityColor(activeItem.rarity) }}>
                 <ArcImage item={activeItem} style={{width:'80%', height:'80%', objectFit:'contain'}} />
              </div>
              <div style={{flex:1}}>
                <h1 className="detail-title">{activeItem.name}</h1>
                <div className="detail-tags">
                   {activeItem.isQuestItem && <span className="tag" style={{color:'var(--c-purple)', borderColor:'var(--c-purple)'}}>QUEST ITEM</span>}
                   {activeItem.isUpgradeItem && <span className="tag" style={{color:'var(--c-yellow)', borderColor:'var(--c-yellow)'}}>UPGRADE PART</span>}
                   {activeItem.soldBy && <span className="tag" style={{color:'var(--c-blue)', borderColor:'var(--c-blue)'}}>SOLD BY {activeItem.soldBy.toUpperCase()}</span>}
                   {activeItem.isSafeToRecycle && <span className="tag" style={{color:'var(--c-red)', borderColor:'var(--c-red)'}}>SAFE TO RECYCLE</span>}
                </div>
                <p style={{color:'#ccc', fontSize:'1.1rem', lineHeight:1.6}}>{activeItem.description}</p>
                <div className="detail-stats">
                    <div><div className="stat-label">WEIGHT</div><div className="stat-val">{activeItem.weight}kg</div></div>
                    <div><div className="stat-label">STACK</div><div className="stat-val">{activeItem.max_stack_size}</div></div>
                    <div><div className="stat-label">VALUE</div><div className="stat-val val-orange">{activeItem.sell_value}</div></div>
                </div>
              </div>
            </div>

            <div className="detail-grid">
                <div>
                    <div style={{marginBottom:30}}>
                         <h3 className="section-title" style={{borderColor: 'var(--c-orange)'}}>
                             Crafting Recipe 
                             {isDetailLoading && <span style={{fontSize:'0.6em', marginLeft:10, color:'#666'}}>Syncing...</span>}
                         </h3>
                         {activeItem.computedIngredients.length > 0 ? (
                             <div style={{background:'#151515', padding:15, borderRadius:8, border:'1px solid #222'}}>
                                <div style={{color:'white', fontWeight:'bold', marginBottom:10}}>
                                    Requires {activeItem.craftedAt ? `(at ${activeItem.craftedAt})` : ''}:
                                </div>
                                <div className="mini-grid">
                                    {activeItem.computedIngredients.map((ing: Ingredient, i: number) => (
                                        <MiniCard key={i} id={ing.id} label={`x${ing.count}`} allItems={items} onClick={goDetail} />
                                    ))}
                                </div>
                             </div>
                         ) : <div className="section-empty">{isDetailLoading ? 'Checking database...' : 'Cannot be crafted (Loot only).'}</div>}
                    </div>

                    <div style={{marginBottom:30}}>
                         <h3 className="section-title" style={{borderColor: '#4caf50', color:'#4caf50'}}>
                             Recycles Into
                             {isDetailLoading && <span style={{fontSize:'0.6em', marginLeft:10, color:'#666'}}>Syncing...</span>}
                         </h3>
                         {activeItem.computedRecyclesInto.length > 0 ? (
                             <div className="mini-grid">
                                 {activeItem.computedRecyclesInto.map((ing: Ingredient, i: number) => (
                                     <MiniCard key={i} id={ing.id} label={`x${ing.count}`} allItems={items} onClick={goDetail} />
                                 ))}
                             </div>
                         ) : <div className="section-empty">Cannot be recycled.</div>}
                    </div>
                </div>

                <div>
                    <div style={{marginBottom:30}}>
                         <h3 className="section-title" style={{borderColor: 'var(--c-blue)'}}>Used In Projects</h3>
                         {activeItem.computedUsedInProjects.length > 0 ? (
                             <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                                 {activeItem.computedUsedInProjects.map((p, i) => (
                                     <div key={i} style={{background:'#111', padding:'8px 12px', borderRadius:6, borderLeft:'3px solid #2196f3', color:'#ccc', fontSize:'0.8rem'}}>{p}</div>
                                 ))}
                             </div>
                         ) : <div className="section-empty">Not used in known projects.</div>}
                    </div>
                    
                    <div style={{marginTop:30}}>
                         <h3 className="section-title" style={{borderColor:'var(--c-purple)', color:'var(--c-purple)'}}>Related Quests</h3>
                         {activeItem.computedRelatedQuests.length > 0 ? (
                             <div className="mini-grid">
                                 {activeItem.computedRelatedQuests.map((q: RawApiQuest, i: number) => (
                                     <div key={i} style={{background:'#111', padding:10, borderRadius:6, borderLeft:'3px solid #b388ff', color:'#ccc', fontSize:'0.8rem'}}>
                                         <div style={{fontWeight:'bold', color:'white'}}>{q.name}</div>
                                         <div style={{fontSize:'0.7em', opacity:0.7}}>{q.trader}</div>
                                     </div>
                                 ))}
                             </div>
                         ) : <div className="section-empty">No related quests.</div>}
                    </div>
                </div>
            </div>
          </div>
        ) : view === 'CATEGORY' && activeCategory ? (
          <div>
             <button onClick={() => goCategory(null)} className="back-btn">← BACK TO DASHBOARD</button>
             <h1 className="page-title">{activeCategory} ITEMS <span className="count-badge">{categories[activeCategory].length}</span></h1>
             <div className="grid-view">
                {categories[activeCategory].map((item) => (
                    <div key={item.id} className="item-card" style={{ borderTopColor: getRarityColor(item.rarity) }} onClick={() => goDetail(item)}>
                        <div className="card-img-container"><ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} /></div>
                        <div className="card-name">{item.name}</div>
                        <div className="card-rarity">{item.rarity}</div>
                        <div className="card-footer"><span style={{color: getCategoryColor(activeCategory), fontWeight:'bold'}}>{activeCategory}</span><span className="card-value">⛃ {item.sell_value}</span></div>
                    </div>
                ))}
             </div>
          </div>
        ) : (
          <>
            <SectionRow title="KEEP FOR QUESTS" cat="QUEST" color="#b388ff" />
            <SectionRow title="WORKSHOP UPGRADES" cat="UPGRADE" color="#ffc107" />
            <SectionRow title="CRAFTABLE PROJECTS" cat="PROJECT" color="#2196f3" />
            <SectionRow title="SAFE TO RECYCLE" cat="RECYCLE" color="#ff5252" />
          </>
        )}
      </main>
      <footer className="footer">
        <div className="footer-title">ARC RAIDERS CHEAT SHEET</div>
        <div style={{marginBottom:15}}>Powered by Metaforge API & RaidTheory Data.</div>
        <div className="footer-links" style={{opacity: 0.4}}>Version 24.0 (Resilient Fixes) • Updated Dec 2025</div>
      </footer>
    </div>
  );
}

export default App;
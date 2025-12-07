import { useState, useEffect, useMemo, useRef } from 'react';
import type { CSSProperties } from 'react';

// --- CONFIG & CACHE ---
const API_BASE = "/api/arc-raiders"; 
const CACHE_KEY = "arc_wiki_v12_FORCE_TRADERS"; // FORCE FRESH FETCH
const CACHE_EXPIRY = 3600 * 1000; // 1 Hour
const PLACEHOLDER_IMG = "https://placehold.co/400x400/1a1a1a/666666?text=No+Image";

// --- TYPES & INTERFACES ---

interface MetaforgeIngredient {
    item_id?: string;
    id?: string;
    quantity?: number;
    count?: number;
    amount?: number;
}

// Updated based on "Golden Record" discovery
interface RawApiItem {
    id: string;
    name: string;
    description?: string;
    
    // Valid Top Level Fields
    value?: number | string; 
    rarity?: string; 
    type?: string; 
    icon?: string; 
    workbench?: string; 

    // The Nested Stats Block
    stat_block?: {
        weight?: number | string;
        stackSize?: number | string;
        max_stack?: number | string;
    };

    // Potential Recipe Data (Keep looking just in case)
    recipe?: { ingredients: MetaforgeIngredient[] };
    ingredients?: MetaforgeIngredient[];
    requirements?: MetaforgeIngredient[];
    cost?: MetaforgeIngredient[];
}

interface RawApiTrader {
    id: string;
    name: string;
    // We treat offers as 'any' arrays to safely probe for unknown keys during debug
    offers?: any[];
    trades?: any[];
    items?: any[];
}

interface RawApiQuest {
    id: string;
    name: string;
    trader: string;
    description: string;
    requirements?: any[];
    rewards?: any[];
}

interface Ingredient {
    id: string;
    count: number;
}

interface RecipeData {
    ingredients: Ingredient[];
    station: string;
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
    craftedAt: string | null; 
    
    // Flags
    isQuestItem: boolean;
    isProjectItem: boolean;
    isUpgradeItem: boolean;
    isSafeToRecycle: boolean;
    
    // Relationships
    computedIngredients: Ingredient[];
    computedUsedIn: ProcessedItem[]; 
    computedRelatedQuests: RawApiQuest[];
}

type ViewState = 'DASHBOARD' | 'CATEGORY' | 'DETAIL';
type CategoryType = 'QUEST' | 'PROJECT' | 'UPGRADE' | 'RECYCLE';
type SortOption = 'Name' | 'Value (High)' | 'Value (Low)' | 'Rarity (High)' | 'Rarity (Low)' | 'Efficiency';

// --- GLOBAL HELPERS ---

const RARITY_WEIGHT: Record<string, number> = { 'common': 1, 'standard': 1, 'uncommon': 2, 'rare': 3, 'epic': 4, 'legendary': 5 };

const getRarityColor = (rarity: string) => {
    switch(rarity?.toLowerCase()) {
      case 'common': 
      case 'standard': return '#e0e0e0'; 
      case 'uncommon': return '#4caf50'; 
      case 'rare': return '#2196f3';
      case 'epic': return '#9c27b0'; 
      case 'legendary': return '#ff9800'; 
      default: return '#e0e0e0';
    }
};

const safeNum = (val: any): number => {
    if (val === null || val === undefined) return 0;
    const num = Number(val);
    return isNaN(num) ? 0 : num;
};

// --- DATA NORMALIZER ---
const normalizeItem = (raw: RawApiItem, recipeMap: Map<string, RecipeData>): ProcessedItem => {
    
    // Look up recipe from Trader Data
    const recipeData = recipeMap.get(raw.id);
    
    // DEBUG: Confirm mapping worked
    if (recipeData) {
        // console.log(`✅ Found Recipe for ${raw.name} at ${recipeData.station}`);
    }

    const traderIngredients = recipeData?.ingredients || [];
    const stationName = recipeData?.station || raw.workbench || null;

    // Look up recipe from Item Data (Fallback)
    const directIngredients = (
        raw.recipe?.ingredients || 
        raw.ingredients || 
        raw.requirements || 
        raw.cost || 
        []
    ).map((i: MetaforgeIngredient) => ({
        id: i.item_id || i.id || "unknown",
        count: safeNum(i.quantity || i.count || i.amount || 1)
    }));

    // Merge Ingredients (prefer Trader data if available)
    const finalIngredients = traderIngredients.length > 0 ? traderIngredients : directIngredients;

    return {
        id: raw.id,
        name: raw.name,
        description: raw.description || "No description available.",
        rarity: raw.rarity || "Standard",
        type: raw.type || "Item",
        craftedAt: stationName,
        
        // Mapped from Golden Record (stat_block)
        weight: safeNum(raw.stat_block?.weight),
        max_stack_size: safeNum(raw.stat_block?.stackSize || raw.stat_block?.max_stack || 1),
        sell_value: safeNum(raw.value),
        
        // Direct URL usage
        imageUrl: raw.icon || "", 

        // Flags (Default false, calculated later)
        isQuestItem: false,
        isProjectItem: false,
        isUpgradeItem: false,
        isSafeToRecycle: true,

        computedIngredients: finalIngredients,
        computedUsedIn: [],
        computedRelatedQuests: []
    };
};

// --- DATA SERVICE ---

const apiService = {
    async fetchAll() {
        // Cache Check
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_EXPIRY) {
                console.log("⚡ Loaded data from Cache");
                return data as { rawItems: RawApiItem[], rawQuests: RawApiQuest[], rawTraders: RawApiTrader[] };
            }
        }

        console.log("🌐 Fetching from Metaforge API...");
        
        const fetchAllPages = async (endpoint: string) => {
            console.log(`🚀 Starting fetch loop for: ${endpoint}`);
            let allResults: any[] = [];
            let page = 1;
            
            while (page < 50) {
                try {
                    const url = `${API_BASE}/${endpoint}?page=${page}&limit=100`;
                    const res = await fetch(url);
                    
                    if (!res.ok) {
                        console.error(`❌ HTTP Error ${res.status} on ${endpoint} page ${page}`);
                        break;
                    }
                    
                    const json = await res.json();
                    const data = Array.isArray(json) ? json : (json.data || []);
                    
                    if (data.length === 0) {
                        console.log(`⏹️ ${endpoint} Page ${page} returned 0 items. Finished.`);
                        break;
                    }

                    allResults = [...allResults, ...data];
                    console.log(`📦 ${endpoint} Page ${page}: Fetched ${data.length} items.`);
                    page++;
                } catch (e) {
                    console.error(`❌ Exception fetching page ${page}:`, e);
                    break;
                }
            }
            return allResults;
        };

        const [rawItems, rawQuests, rawTraders] = await Promise.all([
            fetchAllPages('items'),
            fetchAllPages('quests'),
            fetchAllPages('traders')
        ]);

        const result = { rawItems, rawQuests, rawTraders };
        localStorage.setItem(CACHE_KEY, JSON.stringify({ timestamp: Date.now(), data: result }));
        return result;
    }
};

// --- SUB-COMPONENTS ---

const ArcImage = ({ item, style }: { item: ProcessedItem, style?: CSSProperties }) => {
    const [hasError, setHasError] = useState(false);

    useEffect(() => {
        setHasError(false);
    }, [item.id]);

    let src = item.imageUrl;

    if (!src || hasError) {
        src = PLACEHOLDER_IMG;
    }

    return (
        <img 
            src={src} 
            alt={item.name} 
            style={style} 
            onError={() => setHasError(true)} 
            loading="lazy" 
        />
    );
};

const MiniCard = ({ id, label, allItems, onClick }: { id: string, label?: string, allItems: ProcessedItem[], onClick: (i: ProcessedItem) => void }) => {
    const item = allItems.find(i => i.id === id);
    
    if (!item) return (
        <div className="mini-card-missing">
             <div className="mini-title-missing">{id}</div>
             {label && <div className="mini-sub">{label}</div>}
        </div>
    );

    return (
        <div onClick={() => onClick(item)} className="mini-card">
            <div className="mini-img">
                <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
            </div>
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
            <div onClick={() => setIsOpen(!isOpen)} className={`select-trigger ${isOpen ? 'open' : ''}`}>
                {value} <span className="select-arrow">▼</span>
            </div>
            {isOpen && (
                <div className="select-options">
                    {options.map((opt: SortOption) => (
                        <div key={opt} onClick={() => { onChange(opt); setIsOpen(false); }} className={`option ${value === opt ? 'selected' : ''}`}>
                            {opt}
                        </div>
                    ))}
                </div>
            )}
        </div>
    );
};

// --- MAIN APP COMPONENT ---

function App() {
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  
  const [view, setView] = useState<ViewState>('DASHBOARD');
  const [activeCategory, setActiveCategory] = useState<CategoryType | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProcessedItem | null>(null);
  
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState<SortOption>('Name');

  useEffect(() => {
    const init = async () => {
        setLoading(true);
        setError(null);
        try {
            const { rawItems, rawQuests, rawTraders } = await apiService.fetchAll();

            if (!rawItems || rawItems.length === 0) {
                setError("API returned 0 items.");
                setLoading(false);
                return;
            }

            // --- TRADER RECIPE MAPPER (ROBUST) ---
            if (rawTraders.length > 0) {
                console.log("🔍 FIRST TRADER RAW:", JSON.stringify(rawTraders[0], null, 2));
            }

            const recipeMap = new Map<string, RecipeData>();
            
            rawTraders.forEach((trader: RawApiTrader) => {
                const offers = trader.offers || trader.trades || trader.items || [];
                
                offers.forEach((offer: any) => {
                    // Try ALL possible keys for output ID
                    const outputId = offer.item_id || offer.id || offer.product_id || offer.output_item_id;
                    
                    if (!outputId) return;

                    // Try ALL possible keys for ingredients
                    const rawCost = offer.cost || offer.price || offer.requirements || offer.ingredients || [];
                    
                    const ingredients = rawCost.map((c: any) => ({
                        id: c.item_id || c.id || "unknown",
                        count: safeNum(c.quantity || c.count || c.amount || 1)
                    }));

                    // Only map if it actually costs something (filtering out simple shop items if needed)
                    if (ingredients.length > 0) {
                        recipeMap.set(outputId, { ingredients, station: trader.name });
                    }
                });
            });
            // -------------------------------------

            // 1. Normalize (Injecting Recipe Data)
            const processed: ProcessedItem[] = rawItems.map((item: RawApiItem) => normalizeItem(item, recipeMap));

            // 2. Build Relationships (Reverse Lookup)
            const usedInMap = new Map<string, string[]>();

            processed.forEach((parent: ProcessedItem) => {
                if (parent.computedIngredients.length > 0) {
                    parent.isProjectItem = true; 
                    parent.computedIngredients.forEach((ing: Ingredient) => {
                        const list = usedInMap.get(ing.id) || [];
                        if (!list.includes(parent.id)) list.push(parent.id);
                        usedInMap.set(ing.id, list);
                    });
                }
            });

            // 3. Link Objects
            processed.forEach((item: ProcessedItem) => {
                // Quests
                const myQuests = rawQuests.filter((q: RawApiQuest) => 
                    JSON.stringify(q).includes(`"${item.id}"`) 
                );
                item.computedRelatedQuests = myQuests;
                item.isQuestItem = myQuests.length > 0;

                // Used In
                const parentIds = usedInMap.get(item.id) || [];
                item.computedUsedIn = parentIds.map((pid: string) => processed.find((p: ProcessedItem) => p.id === pid)).filter(Boolean) as ProcessedItem[];

                // Upgrades
                item.isUpgradeItem = item.computedUsedIn.some((p: ProcessedItem) => {
                    const n = p.name.toLowerCase();
                    return n.includes('upgrade') || n.includes('station') || n.includes('module');
                });

                // Recycle
                item.isSafeToRecycle = !item.isQuestItem && !item.isProjectItem && !item.isUpgradeItem;
            });

            setItems(processed);
        } catch (err: any) {
            console.error("💥 Critical Initialization Error:", err);
            setError(err.message || "An unknown error occurred.");
        } finally {
            setLoading(false);
        }
    };

    init();
  }, []);

  const categories = useMemo(() => {
    let filtered = items.filter((i: ProcessedItem) => i.name.toLowerCase().includes(search.toLowerCase()));
    
    const getRarityWeight = (r: string) => RARITY_WEIGHT[r.toLowerCase()] || 0;

    filtered.sort((a: ProcessedItem, b: ProcessedItem) => {
        if (sortBy === 'Value (High)') return b.sell_value - a.sell_value;
        if (sortBy === 'Value (Low)') return a.sell_value - b.sell_value;
        if (sortBy === 'Rarity (High)') return getRarityWeight(b.rarity) - getRarityWeight(a.rarity);
        if (sortBy === 'Rarity (Low)') return getRarityWeight(a.rarity) - getRarityWeight(b.rarity);
        if (sortBy === 'Efficiency') return (b.sell_value / (b.weight||1)) - (a.sell_value / (a.weight||1));
        return a.name.localeCompare(b.name);
    });

    return {
        QUEST: filtered.filter((i: ProcessedItem) => i.isQuestItem),
        UPGRADE: filtered.filter((i: ProcessedItem) => i.isUpgradeItem),
        PROJECT: filtered.filter((i: ProcessedItem) => i.isProjectItem),
        RECYCLE: filtered.filter((i: ProcessedItem) => i.isSafeToRecycle)
    };
  }, [items, search, sortBy]);

  const goDetail = (item: ProcessedItem) => { setSelectedItem(item); setView('DETAIL'); window.scrollTo(0, 0); };
  const goCategory = (cat: CategoryType | null) => { 
      if (cat === null) { setView('DASHBOARD'); setActiveCategory(null); } 
      else { setActiveCategory(cat); setView('CATEGORY'); }
      window.scrollTo(0, 0); 
  };

  const SectionRow = ({ title, cat, color }: { title: string, cat: CategoryType, color: string }) => {
    const data = categories[cat];
    if (data.length === 0) return null;
    return (
      <div className="section-container">
        <div className="section-header">
            <h2 className="section-title" style={{ borderLeftColor: color }}>
                {title} <span className="count-badge">{data.length}</span>
            </h2>
            <button onClick={() => goCategory(cat)} className="see-all-btn" style={{ borderColor: color, color: color }}>SEE ALL →</button>
        </div>
        <div className="carousel">
            {data.slice(0, 10).map((item: ProcessedItem) => (
                <div key={item.id} className="item-card" style={{ borderTopColor: getRarityColor(item.rarity) }} onClick={() => goDetail(item)}>
                    <div className="card-img-container">
                        <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                    </div>
                    <div className="card-name">{item.name}</div>
                    <div className="card-rarity">{item.rarity}</div>
                    <div className="card-footer">
                         <span style={{color:color, fontWeight:'bold'}}>{cat}</span>
                         <span className="card-value">⛃ {item.sell_value}</span>
                    </div>
                </div>
            ))}
        </div>
      </div>
    );
  };

  if (loading) return <div className="loading-screen"><h2 style={{color:'var(--c-orange)'}}>SYNCING METAFORGE DATABASE...</h2></div>;

  if (error) {
      return (
          <div style={{display:'flex', justifyContent:'center', alignItems:'center', height:'100vh', flexDirection:'column', color:'white', textAlign:'center', padding:20}}>
              <h1 style={{color:'var(--c-red)', fontSize:'3rem'}}>⚠️ SYSTEM ERROR</h1>
              <p style={{fontSize:'1.2rem', maxWidth:600}}>{error}</p>
              <button onClick={() => window.location.reload()} style={{marginTop:20, padding:'10px 20px', background:'#333', color:'white', border:'1px solid white', cursor:'pointer'}}>RETRY CONNECTION</button>
          </div>
      );
  }

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
            <div className="controls-right">
                <span>SORT <CustomSelect value={sortBy} onChange={setSortBy} /></span>
            </div>
        </div></div>
      </header>

      <main className="main-content">
        {view === 'DETAIL' && selectedItem ? (
          <div className="detail-container">
            <button onClick={() => { setView(activeCategory ? 'CATEGORY' : 'DASHBOARD'); }} className="back-btn">← BACK</button>
            <div className="detail-header">
              <div className="detail-img-box" style={{ borderColor: getRarityColor(selectedItem.rarity) }}>
                 <ArcImage item={selectedItem} style={{width:'80%', height:'80%', objectFit:'contain'}} />
              </div>
              <div style={{flex:1}}>
                <h1 className="detail-title">{selectedItem.name}</h1>
                <div className="detail-tags">
                   {selectedItem.isQuestItem && <span className="tag" style={{color:'var(--c-purple)', borderColor:'var(--c-purple)'}}>QUEST ITEM</span>}
                   {selectedItem.isUpgradeItem && <span className="tag" style={{color:'var(--c-yellow)', borderColor:'var(--c-yellow)'}}>UPGRADE PART</span>}
                   {selectedItem.isProjectItem && <span className="tag" style={{color:'var(--c-blue)', borderColor:'var(--c-blue)'}}>CRAFTABLE</span>}
                   {selectedItem.isSafeToRecycle && <span className="tag" style={{color:'var(--c-red)', borderColor:'var(--c-red)'}}>SAFE TO RECYCLE</span>}
                </div>
                <p style={{color:'#ccc', fontSize:'1.1rem', lineHeight:1.6}}>{selectedItem.description}</p>
                <div className="detail-stats">
                    <div><div className="stat-label">WEIGHT</div><div className="stat-val">{selectedItem.weight}kg</div></div>
                    <div><div className="stat-label">STACK</div><div className="stat-val">{selectedItem.max_stack_size}</div></div>
                    <div><div className="stat-label">VALUE</div><div className="stat-val val-orange">{selectedItem.sell_value}</div></div>
                </div>
              </div>
            </div>

            <div className="detail-grid">
                <div>
                    <div style={{marginBottom:30}}>
                         <h3 className="section-title" style={{borderColor: 'var(--c-orange)'}}>Crafting Recipe</h3>
                         {selectedItem.computedIngredients.length > 0 ? (
                             <div style={{background:'#151515', padding:15, borderRadius:8, border:'1px solid #222'}}>
                                <div style={{color:'white', fontWeight:'bold', marginBottom:10}}>
                                    Requires {selectedItem.craftedAt ? `(at ${selectedItem.craftedAt})` : ''}:
                                </div>
                                <div className="mini-grid">
                                    {selectedItem.computedIngredients.map((ing: Ingredient, i: number) => (
                                        <MiniCard key={i} id={ing.id} label={`x${ing.count}`} allItems={items} onClick={goDetail} />
                                    ))}
                                </div>
                             </div>
                         ) : <div className="section-empty">Cannot be crafted (Loot only).</div>}
                    </div>
                </div>

                <div>
                    <div style={{marginBottom:30}}>
                         <h3 className="section-title" style={{borderColor: 'var(--c-blue)'}}>Used In Projects</h3>
                         {selectedItem.computedUsedIn.length > 0 ? (
                             <div className="mini-grid">
                                 {selectedItem.computedUsedIn
                                    .filter((p: ProcessedItem) => !p.name.toLowerCase().includes('upgrade') && !p.name.toLowerCase().includes('module'))
                                    .map((p: ProcessedItem, i: number) => <MiniCard key={i} id={p.id} label={p.name} allItems={items} onClick={goDetail} />)
                                 }
                             </div>
                         ) : <div className="section-empty">Not used in standard projects.</div>}
                    </div>

                    <div>
                         <h3 className="section-title" style={{borderColor:'var(--c-yellow)', color:'var(--c-yellow)'}}>Used In Upgrades</h3>
                         {selectedItem.computedUsedIn.some((p: ProcessedItem) => p.name.toLowerCase().includes('upgrade') || p.name.toLowerCase().includes('module')) ? (
                             <div className="mini-grid">
                                 {selectedItem.computedUsedIn
                                    .filter((p: ProcessedItem) => p.name.toLowerCase().includes('upgrade') || p.name.toLowerCase().includes('module'))
                                    .map((p: ProcessedItem, i: number) => (
                                     <div key={i} onClick={() => goDetail(p)} style={{background:'#111', padding:10, borderRadius:6, borderLeft:'3px solid #ffc107', color:'#ccc', fontSize:'0.8rem', cursor:'pointer'}}>
                                         {p.name}
                                     </div>
                                 ))}
                             </div>
                         ) : <div className="section-empty">Not used for upgrades.</div>}
                    </div>
                    
                    <div style={{marginTop:30}}>
                         <h3 className="section-title" style={{borderColor:'var(--c-purple)', color:'var(--c-purple)'}}>Related Quests</h3>
                         {selectedItem.computedRelatedQuests.length > 0 ? (
                             <div className="mini-grid">
                                 {selectedItem.computedRelatedQuests.map((q: RawApiQuest, i: number) => (
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
                {categories[activeCategory].map((item: ProcessedItem) => (
                    <div key={item.id} className="item-card" style={{ borderTopColor: getRarityColor(item.rarity) }} onClick={() => goDetail(item)}>
                        <div className="card-img-container">
                            <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
                        </div>
                        <div className="card-name">{item.name}</div>
                        <div className="card-rarity">{item.rarity}</div>
                        <div className="card-footer">
                            <span className={`text-${activeCategory.toLowerCase()}`}>{activeCategory}</span>
                            <span className="card-value">⛃ {item.sell_value}</span>
                        </div>
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
        <div style={{marginBottom:15}}>Powered by Metaforge API. Not affiliated with Embark Studios.</div>
        <div className="footer-links" style={{opacity: 0.4}}>Version 12.0 (Trader Fix) • Updated Dec 2025</div>
      </footer>
    </div>
  );
}

export default App;
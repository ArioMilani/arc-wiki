import { useState, useEffect, useMemo } from 'react';
// We must import Types separately in your project configuration
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
  craftingRecipe: { station: string; inputs: { item: string; count: number }[] } | null;
  usedInCrafting: string[];
  obtainedFromTrades: string[];
}

const CACHE_KEY = 'arc_wiki_items_cache_v2';
const CACHE_DURATION = 1000 * 60 * 60; // 1 Hour

function App() {
  const [items, setItems] = useState<ProcessedItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [progress, setProgress] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ProcessedItem | null>(null);
  const [search, setSearch] = useState("");

  // Helper to extract English text safely
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

        // 1. Check Cache
        const cached = localStorage.getItem(CACHE_KEY);
        if (cached) {
          try {
            const { timestamp, data } = JSON.parse(cached);
            if (Date.now() - timestamp < CACHE_DURATION) {
              setItems(data);
              setLoading(false);
              return;
            }
          } catch (e) {
            console.warn("Cache corrupted, clearing...");
            localStorage.removeItem(CACHE_KEY);
          }
        }

        setProgress("Connecting to GitHub...");

        // 2. Fetch Item List
        const itemsListRes = await fetch("https://api.github.com/repos/RaidTheory/arcraiders-data/contents/items");
        
        if (itemsListRes.status === 403) {
             throw new Error("GitHub Limit Hit. Wait 30m or use a VPN.");
        }
        if (!itemsListRes.ok) throw new Error("Failed to load items list.");
        
        const itemsList = await itemsListRes.json();
        
        // 3. Fetch Projects & Trades
        const [projectsRes, tradesRes] = await Promise.all([
          fetch("https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/projects.json"),
          fetch("https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/trades.json")
        ]);

        const projectsData = projectsRes.ok ? await projectsRes.json() : [];
        const tradesData = tradesRes.ok ? await tradesRes.json() : [];

        // 4. Fetch ALL Items
        const rawItems: any[] = [];
        const chunkSize = 50;
        
        // Safety check: ensure itemsList is an array
        if (Array.isArray(itemsList)) {
            for (let i = 0; i < itemsList.length; i += chunkSize) {
                const chunk = itemsList.slice(i, i + chunkSize);
                setProgress(`Downloading items... ${i + chunk.length} / ${itemsList.length}`);
                
                const chunkPromises = chunk.map((file: any) => 
                    fetch(file.download_url).then(res => res.json().catch(() => null))
                );
                const chunkResults = await Promise.all(chunkPromises);
                rawItems.push(...chunkResults);
            }
        }

        // 5. Process Data
        setProgress("Processing relationships...");
        const processed = rawItems
          .filter(item => item && (item.id || item.name))
          .map((item: any) => {
            
            const safeId = String(item.id || "unknown");
            const safeName = getText(item.name);
            const safeDesc = getText(item.description);

            const recipe = projectsData.find((p: any) => 
              p.yield && Array.isArray(p.yield) && p.yield.some((y: any) => String(y.item) === safeId)
            );

            const usedIn = projectsData
              .filter((p: any) => p.cost && Array.isArray(p.cost) && p.cost.some((c: any) => String(c.item) === safeId))
              .map((p: any) => getText(p.name));

            const trades = tradesData
              .filter((t: any) => t.offer && Array.isArray(t.offer) && t.offer.some((o: any) => String(o.item) === safeId))
              .map((t: any) => `Trader: ${t.trader}`);

            return {
              id: safeId,
              name: safeName,
              rarity: item.rarity || 'Common',
              type: item.type || 'Material',
              description: safeDesc,
              weight: Number(item.weight) || 0,
              max_stack_size: Number(item.max_stack_size) || 1,
              sell_value: Number(item.sell_value) || 0,
              imgUrl: `https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/images/items/${safeId}.png`,
              craftingRecipe: recipe ? { station: "Project Bench", inputs: recipe.cost || [] } : null,
              usedInCrafting: usedIn,
              obtainedFromTrades: trades
            };
          });

        localStorage.setItem(CACHE_KEY, JSON.stringify({
            timestamp: Date.now(),
            data: processed
        }));

        setItems(processed);

      } catch (err: any) {
        console.error(err);
        setError(err.message || "Unknown error occurred");
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, []);

  const filteredItems = useMemo(() => 
    items.filter(i => i.name.toLowerCase().includes(search.toLowerCase())), 
  [items, search]);

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

  // --- STYLES ---
  // We type the styles explicitly to avoid TypeScript complaints
  const s: { [key: string]: CSSProperties | ((arg: any) => CSSProperties) } = {
    app: { backgroundColor: '#0a0a0a', color: '#ccc', minHeight: '100vh', fontFamily: 'Inter, sans-serif' },
    header: { padding: '0 40px', height: '80px', borderBottom: '1px solid #222', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#0f0f0f', position: 'sticky', top: 0, zIndex: 100 },
    search: { background:'#1a1a1a', border:'1px solid #333', padding:'10px 15px', color:'white', borderRadius:6, width: '300px', fontSize:'0.9rem' },
    main: { padding: '40px', maxWidth: '1400px', margin: '0 auto' },
    grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: '20px' },
    
    card: (rarity: string) => ({
      backgroundColor: '#141414',
      borderRadius: '8px',
      border: '1px solid #2a2a2a',
      borderTop: `3px solid ${getRarityColor(rarity)}`,
      padding: '15px',
      cursor: 'pointer',
      transition: 'transform 0.2s, box-shadow 0.2s',
      display: 'flex',
      flexDirection: 'column',
      position: 'relative',
      overflow: 'hidden',
      height: '280px' // Fixed height ensures grid looks uniform
    }),
    
    cardImageContainer: {
      height: '140px',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: '15px',
      background: 'radial-gradient(circle, #252525 0%, #141414 70%)',
      borderRadius: '4px'
    },

    cardStats: {
        display: 'flex',
        justifyContent: 'space-between',
        marginTop: 'auto',
        fontSize: '0.8rem',
        color: '#888',
        borderTop: '1px solid #222',
        paddingTop: '10px'
    },
    
    detailContainer: { maxWidth: '1000px', margin: '0 auto' },
    backBtn: { background:'transparent', border:'none', color:'#ff9800', cursor:'pointer', fontSize:'1rem', marginBottom: 20, fontWeight:'bold' },
    section: { marginBottom: 30, background: '#111', padding: 25, borderRadius: 12, border: '1px solid #222' },
    tag: { padding: '4px 10px', borderRadius: 4, fontSize: '0.8em', fontWeight:'bold', marginRight: 10 },
  };

  // --- Render ---

  if (loading) return (
    <div style={{...s.app as CSSProperties, display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center'}}>
      <h2 style={{color:'#ff9800', fontSize:'2rem', letterSpacing:'2px'}}>ARC WIKI</h2>
      <p style={{marginTop: 20, color:'#888'}}>{progress}</p>
      <div style={{width: 300, height: 4, background: '#222', borderRadius: 2, marginTop: 15}}>
          <div style={{width: '30%', height: '100%', background: '#ff9800', transition: 'width 0.2s'}} />
      </div>
    </div>
  );

  if (error) return (
    <div style={{...s.app as CSSProperties, padding:50, color:'red', textAlign:'center'}}>
        <h2>Connection Error</h2>
        <p>{error}</p>
        <button 
            onClick={() => {localStorage.removeItem(CACHE_KEY); window.location.reload()}} 
            style={{marginTop:20, background:'#333', color:'white', border:'none', padding:'10px 20px', cursor:'pointer', borderRadius:4}}
        >
            Retry
        </button>
    </div>
  );

  return (
    <div style={s.app as CSSProperties}>
      <header style={s.header as CSSProperties}>
        <h1 style={{margin:0, color:'#ff9800', letterSpacing:'1px', fontWeight:'800', fontSize:'1.5rem'}}>ARC <span style={{color:'white'}}>WIKI</span></h1>
        <input style={s.search as CSSProperties} placeholder="Search database..." value={search} onChange={e => setSearch(e.target.value)} />
      </header>
      
      <main style={s.main as CSSProperties}>
        {selectedItem ? (
          <div style={s.detailContainer as CSSProperties}>
            <button onClick={() => setSelectedItem(null)} style={s.backBtn as CSSProperties}>← BACK TO GRID</button>
            
            <div style={{display:'flex', gap:30, marginBottom:40, alignItems:'flex-start'}}>
              <div style={{width:160, height:160, background:'#151515', border:`2px solid ${getRarityColor(selectedItem.rarity)}`, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', boxShadow:'0 10px 30px rgba(0,0,0,0.5)'}}>
                 <img src={selectedItem.imgUrl} alt="" style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} onError={(e: SyntheticEvent<HTMLImageElement, Event>) => e.currentTarget.style.display='none'} />
              </div>
              <div style={{flex:1}}>
                <div style={{display:'flex', alignItems:'center', gap:15, marginBottom:10}}>
                    <h1 style={{margin:0, color:'white', fontSize:'3rem', lineHeight:1}}>{selectedItem.name}</h1>
                </div>
                <div style={{marginBottom: 20}}>
                    <span style={{...s.tag as CSSProperties, background: getRarityColor(selectedItem.rarity), color: selectedItem.rarity === 'Common' ? 'black' : 'white'}}>{selectedItem.rarity}</span>
                    <span style={{...s.tag as CSSProperties, background:'#222', color:'#888', border:'1px solid #333'}}>{selectedItem.type}</span>
                </div>
                
                <div style={{display:'flex', gap:40, borderTop:'1px solid #222', paddingTop:20, marginTop:20}}>
                   <div>
                       <div style={{color:'#666', fontSize:'0.8rem', textTransform:'uppercase', fontWeight:'bold', marginBottom:5}}>Weight</div>
                       <div style={{color:'white', fontSize:'1.2rem', fontWeight:'bold'}}>{selectedItem.weight} <span style={{fontSize:'0.8rem', color:'#666'}}>kg</span></div>
                   </div>
                   <div>
                       <div style={{color:'#666', fontSize:'0.8rem', textTransform:'uppercase', fontWeight:'bold', marginBottom:5}}>Stack</div>
                       <div style={{color:'white', fontSize:'1.2rem', fontWeight:'bold'}}>{selectedItem.max_stack_size}</div>
                   </div>
                   <div>
                       <div style={{color:'#666', fontSize:'0.8rem', textTransform:'uppercase', fontWeight:'bold', marginBottom:5}}>Value</div>
                       <div style={{color:'#ff9800', fontSize:'1.2rem', fontWeight:'bold'}}>{selectedItem.sell_value}</div>
                   </div>
                </div>
              </div>
            </div>

            <div style={s.section as CSSProperties}>
              <h3 style={{color:'#ff9800', marginTop:0, textTransform:'uppercase', fontSize:'0.9rem', letterSpacing:'1px'}}>Description</h3>
              <p style={{lineHeight: 1.6, fontSize:'1.1rem', color:'#ddd'}}>{selectedItem.description}</p>
            </div>

            <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:20}}>
                {selectedItem.craftingRecipe && (
                    <div style={s.section as CSSProperties}>
                    <h3 style={{color:'#ff9800', marginTop:0, textTransform:'uppercase', fontSize:'0.9rem', letterSpacing:'1px'}}>Crafting Recipe</h3>
                    <div style={{marginBottom:15, fontSize:'0.9em', color:'#888'}}>Station: <span style={{color:'white'}}>{selectedItem.craftingRecipe.station}</span></div>
                    <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                        {selectedItem.craftingRecipe.inputs.map((input, i) => (
                        <div key={i} style={{background:'#222', padding:'8px 12px', borderRadius:6, border:'1px solid #333', display:'flex', alignItems:'center', gap:8}}>
                            <span style={{color:'white'}}>{input.item}</span>
                            <span style={{color:'#ff9800', fontWeight:'bold'}}>x{input.count}</span>
                        </div>
                        ))}
                    </div>
                    </div>
                )}

                {selectedItem.usedInCrafting.length > 0 && (
                    <div style={s.section as CSSProperties}>
                    <h3 style={{color:'#ff9800', marginTop:0, textTransform:'uppercase', fontSize:'0.9rem', letterSpacing:'1px'}}>Used In Projects</h3>
                    <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                        {selectedItem.usedInCrafting.map((name, i) => (
                        <div key={i} style={{background:'#222', padding:'6px 12px', borderRadius:6, border:'1px solid #333', fontSize:'0.9rem'}}>{name}</div>
                        ))}
                    </div>
                    </div>
                )}
            </div>
            {selectedItem.obtainedFromTrades.length > 0 && (
                <div style={s.section as CSSProperties}>
                  <h3 style={{color:'#ff9800', marginTop:0, textTransform:'uppercase', fontSize:'0.9rem', letterSpacing:'1px'}}>Sold By Traders</h3>
                  <div style={{display:'flex', gap:10, flexWrap:'wrap'}}>
                    {selectedItem.obtainedFromTrades.map((name, i) => (
                      <div key={i} style={{background:'#222', padding:'6px 12px', borderRadius:6, border:'1px solid #333', fontSize:'0.9rem'}}>{name}</div>
                    ))}
                  </div>
                </div>
            )}
          </div>
        ) : (
          <div style={s.grid as CSSProperties}>
            {filteredItems.map(item => (
              <div 
                key={item.id} 
                style={(s.card as Function)(item.rarity)} 
                onClick={() => { setSelectedItem(item); window.scrollTo(0,0); }}
                onMouseEnter={(e) => { e.currentTarget.style.transform = 'translateY(-5px)'; e.currentTarget.style.boxShadow = '0 5px 15px rgba(0,0,0,0.5)'; }}
                onMouseLeave={(e) => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = 'none'; }}
              >
                <div style={s.cardImageContainer as CSSProperties}>
                   <img 
                    src={item.imgUrl} 
                    alt={item.name} 
                    style={{maxWidth:'70%', maxHeight:'70%', objectFit:'contain', filter:'drop-shadow(0 5px 5px rgba(0,0,0,0.5))'}} 
                    onError={(e: SyntheticEvent<HTMLImageElement, Event>) => e.currentTarget.style.opacity='0.2'} 
                   />
                </div>
                
                <div style={{fontWeight:'700', color:'white', fontSize:'1rem', lineHeight:1.2, marginBottom:5}}>{item.name}</div>
                <div style={{fontSize:'0.8rem', color: getRarityColor(item.rarity), fontWeight:'bold', marginBottom:'auto'}}>{item.rarity}</div>
                
                <div style={s.cardStats as CSSProperties}>
                    <div style={{display:'flex', alignItems:'center', gap:4}}>
                        <span style={{fontSize:'1.2em'}}>⚖</span> {item.weight}
                    </div>
                    <div style={{display:'flex', alignItems:'center', gap:4}}>
                        <span style={{color:'#ff9800', fontSize:'1.2em'}}>⛃</span> {item.sell_value}
                    </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}

export default App;
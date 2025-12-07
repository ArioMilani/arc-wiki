// import React from 'react';
// import { ArcImage } from './ArcImage';

// // --- Types ---
// interface ItemDetailProps {
//     item: any;
//     allItems: any[];
//     projects: any[];
//     quests: any[];
//     recipes: any[]; // New data source for recycling
//     onBack: () => void;
//     onNavigate: (item: any) => void;
// }

// // --- Helper Styles ---
// const s = {
//     section: { marginBottom: 40 },
//     sectionTitle: { color: '#ff9800', fontSize: '1rem', fontWeight: 800, textTransform: 'uppercase' as const, marginBottom: 15, paddingLeft: 10, borderLeft: '3px solid #ff9800' },
//     grid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: '15px' },
//     card: { background: '#111', border: '1px solid #222', borderRadius: 8, padding: 12, cursor: 'pointer', transition: '0.2s' },
//     cardTitle: { color: 'white', fontSize: '0.85rem', fontWeight: 700, marginTop: 10, whiteSpace: 'nowrap' as const, overflow: 'hidden', textOverflow: 'ellipsis' },
//     label: { fontSize: '0.7rem', color: '#666', fontWeight: 600, marginTop: 4 },
//     empty: { color: '#444', fontStyle: 'italic', fontSize: '0.9rem' }
// };

// // --- Sub-Component: Mini Item Card ---
// const MiniCard = ({ id, label, allItems, onClick }: { id: string, label?: string, allItems: any[], onClick: (i:any) => void }) => {
//     // Find the full item data to get the name/rarity
//     const item = allItems.find(i => i.id === id) || { id, name: id, rarity: 'Common' };
    
//     return (
//         <div style={s.card} onClick={() => onClick(item)} onMouseEnter={e => e.currentTarget.style.borderColor = '#444'} onMouseLeave={e => e.currentTarget.style.borderColor = '#222'}>
//             <div style={{height: 80, display:'flex', alignItems:'center', justifyContent:'center', background: 'radial-gradient(circle, #222 0%, #111 70%)', borderRadius:4}}>
//                 <ArcImage item={item} style={{maxWidth:'80%', maxHeight:'80%', objectFit:'contain'}} />
//             </div>
//             <div style={s.cardTitle}>{item.name}</div>
//             {label && <div style={s.label}>{label}</div>}
//         </div>
//     );
// };

// export default function ItemDetail({ item, allItems, projects, quests, recipes, onBack, onNavigate }: ItemDetailProps) {

//     // 1. RECYCLES INTO (Search Recipes where Input == Item)
//     const recyclesInto = recipes
//         .filter(r => r.ingredients && r.ingredients.some((i: any) => i.item === item.id))
//         .flatMap(r => r.outputs || []);

//     // 2. RECYCLES FROM (Search Recipes where Output == Item)
//     const recyclesFrom = recipes
//         .filter(r => r.outputs && r.outputs.some((o: any) => o.item === item.id))
//         .flatMap(r => r.ingredients || []);

//     // 3. CRAFTING RECIPE (Search Projects where Yield == Item)
//     const craftedBy = projects.find(p => p.yield && p.yield.some((y: any) => y.item === item.id));
    
//     // 4. USED IN CRAFTING (Search Projects where Cost includes Item)
//     const usedInCrafting = projects.filter(p => p.cost && p.cost.some((c: any) => c.item === item.id) && !p.name.toLowerCase().includes('upgrade'));

//     // 5. USED IN UPGRADES (Search Projects that are Upgrades)
//     const usedInUpgrades = projects.filter(p => p.cost && p.cost.some((c: any) => c.item === item.id) && (p.name.toLowerCase().includes('upgrade') || p.name.toLowerCase().includes('station')));

//     // 6. RELATED QUESTS
//     const relatedQuests = quests.filter(q => 
//         (q.objectives && q.objectives.some((o: any) => o.item === item.id)) ||
//         (q.cost && q.cost.some((c: any) => c.item === item.id))
//     );

//     return (
//         <div style={{maxWidth: 1200, margin: '0 auto', padding: '40px'}}>
//             {/* HEADER */}
//             <button onClick={onBack} style={{background:'transparent', border:'none', color:'#ff9800', cursor:'pointer', fontSize:'1rem', marginBottom: 30, fontWeight:'bold'}}>← BACK TO DASHBOARD</button>
            
//             <div style={{display:'flex', gap:50, marginBottom: 60, alignItems:'flex-start'}}>
//                 <div style={{width: 300, height: 300, background: '#111', border: '1px solid #222', borderRadius: 12, display:'flex', alignItems:'center', justifyContent:'center'}}>
//                     <ArcImage item={item} style={{width:'80%', maxHeight:'80%', objectFit:'contain'}} />
//                 </div>
//                 <div style={{flex:1}}>
//                     <div style={{display:'flex', gap:10, marginBottom:10}}>
//                         <span style={{background:'#222', color: '#ccc', padding:'4px 12px', borderRadius:4, fontSize:'0.8rem', fontWeight:'bold'}}>{item.rarity}</span>
//                         <span style={{background:'#222', color: '#ccc', padding:'4px 12px', borderRadius:4, fontSize:'0.8rem', fontWeight:'bold'}}>{item.type}</span>
//                     </div>
//                     <h1 style={{fontSize: '3.5rem', margin: '0 0 20px 0', color:'white', lineHeight:1}}>{item.name}</h1>
//                     <p style={{fontSize: '1.1rem', color: '#888', lineHeight: 1.6, maxWidth: 600}}>{item.description}</p>
                    
//                     <div style={{display:'flex', gap:50, marginTop: 40, borderTop:'1px solid #222', paddingTop:20}}>
//                          <div><div style={{color:'#666', fontSize:'0.8rem', fontWeight:'bold'}}>VALUE</div><div style={{color:'#ff9800', fontSize:'1.5rem', fontWeight:'900'}}>{item.sell_value}</div></div>
//                          <div><div style={{color:'#666', fontSize:'0.8rem', fontWeight:'bold'}}>WEIGHT</div><div style={{color:'white', fontSize:'1.5rem', fontWeight:'900'}}>{item.weight}</div></div>
//                          <div><div style={{color:'#666', fontSize:'0.8rem', fontWeight:'bold'}}>STACK</div><div style={{color:'white', fontSize:'1.5rem', fontWeight:'900'}}>{item.max_stack_size}</div></div>
//                     </div>
//                 </div>
//             </div>

//             {/* --- SECTIONS --- */}

//             {/* CRAFTING RECIPE */}
//             {craftedBy && (
//                 <div style={s.section}>
//                     <div style={s.sectionTitle}>Crafting Recipe</div>
//                     <div style={{background:'#151515', padding:20, borderRadius:8, border:'1px solid #222'}}>
//                          <div style={{color:'white', fontWeight:'bold', marginBottom:15}}>{craftedBy.name}</div>
//                          <div style={s.grid}>
//                             {craftedBy.cost.map((ing: any, i: number) => (
//                                 <MiniCard key={i} id={ing.item} label={`x${ing.count}`} allItems={allItems} onClick={onNavigate} />
//                             ))}
//                          </div>
//                     </div>
//                 </div>
//             )}

//             {/* USED IN CRAFTING */}
//             <div style={s.section}>
//                 <div style={s.sectionTitle}>Used In Crafting</div>
//                 {usedInCrafting.length > 0 ? (
//                     <div style={s.grid}>
//                         {usedInCrafting.map(p => <MiniCard key={p.id} id={p.yield?.[0]?.item || p.id} label={p.name} allItems={allItems} onClick={() => {}} />)}
//                     </div>
//                 ) : <div style={s.empty}>Not used in any crafting recipes.</div>}
//             </div>

//             {/* WORKSHOP UPGRADES */}
//             <div style={s.section}>
//                 <div style={{...s.sectionTitle, borderColor: '#ffc107', color: '#ffc107'}}>Used in Bench Upgrades</div>
//                 {usedInUpgrades.length > 0 ? (
//                     <div style={s.grid}>
//                          {usedInUpgrades.map(p => (
//                              <div key={p.id} style={{...s.card, borderLeft:'3px solid #ffc107'}}>
//                                  <div style={s.cardTitle}>{p.name}</div>
//                                  <div style={s.label}>Upgrade Project</div>
//                              </div>
//                          ))}
//                     </div>
//                 ) : <div style={s.empty}>Not used for upgrades.</div>}
//             </div>

//             {/* RELATED QUESTS */}
//             <div style={s.section}>
//                 <div style={{...s.sectionTitle, borderColor: '#b388ff', color: '#b388ff'}}>Related Quests</div>
//                 {relatedQuests.length > 0 ? (
//                     <div style={s.grid}>
//                         {relatedQuests.map(q => (
//                             <div key={q.id} style={{...s.card, borderLeft:'3px solid #b388ff'}}>
//                                 <div style={s.cardTitle}>{q.name}</div>
//                                 <div style={s.label}>{q.trader}</div>
//                             </div>
//                         ))}
//                     </div>
//                 ) : <div style={s.empty}>No related quests found.</div>}
//             </div>

//             {/* RECYCLES INTO / FROM (Using Recipes Data) */}
//             <div style={{display:'grid', gridTemplateColumns:'1fr 1fr', gap:40}}>
//                 <div style={s.section}>
//                     <div style={{...s.sectionTitle, borderColor:'#4caf50', color:'#4caf50'}}>Recycles Into</div>
//                     {recyclesInto.length > 0 ? (
//                         <div style={s.grid}>
//                             {recyclesInto.map((r:any, i:number) => <MiniCard key={i} id={r.item} label={`x${r.count}`} allItems={allItems} onClick={onNavigate} />)}
//                         </div>
//                     ) : <div style={s.empty}>Cannot be recycled.</div>}
//                 </div>

//                 <div style={s.section}>
//                     <div style={{...s.sectionTitle, borderColor:'#4caf50', color:'#4caf50'}}>Salvaged From</div>
//                     {recyclesFrom.length > 0 ? (
//                         <div style={s.grid}>
//                             {recyclesFrom.map((r:any, i:number) => <MiniCard key={i} id={r.item} label="Source" allItems={allItems} onClick={onNavigate} />)}
//                         </div>
//                     ) : <div style={s.empty}>No items recycle into this.</div>}
//                 </div>
//             </div>

//         </div>
//     );
// }
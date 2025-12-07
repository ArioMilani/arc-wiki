// import { useState, useEffect } from 'react';
// import type { CSSProperties, SyntheticEvent } from 'react';

// interface ProcessedItem {
//   id: string;
//   name: string;
// }

// export const ArcImage = ({ item, style }: { item: ProcessedItem | { id: string, name: string }, style?: CSSProperties }) => {
//   const BASE_URL = "https://raw.githubusercontent.com/RaidTheory/arcraiders-data/main/images/items";
//   const [loadState, setLoadState] = useState<'primary' | 'fallback' | 'error'>('primary');

//   // Determine ID safely
//   const safeId = typeof item === 'string' ? item : item.id; 
//   const safeName = typeof item === 'string' ? item : item.name;

//   useEffect(() => { setLoadState('primary'); }, [safeId]);

//   const handleError = () => {
//       if (loadState === 'primary') setLoadState('fallback');
//       else if (loadState === 'fallback') setLoadState('error');
//   };

//   if (loadState === 'error') return <div style={{...style, display:'flex', alignItems:'center', justifyContent:'center', background:'#1a1a1a', borderRadius:4, color:'#444', fontSize:'1.5rem'}}>📦</div>;

//   const url = loadState === 'primary' ? `${BASE_URL}/${safeId}.png` : `${BASE_URL}/${safeId.replace(/ /g, '_')}.png`;
  
//   return <img src={url} alt={safeName} style={style} onError={handleError} loading="lazy" />;
// };
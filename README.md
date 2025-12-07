# ARC Raiders Wiki & Cheat Sheet

A fast, interactive companion app for **ARC Raiders**, designed to bridge the gap between live market data and deep game mechanics.

This project uses a **Hybrid Data Architecture** to provide features that single APIs cannot offer:
1.  **Live Market Data:** Fetches prices and images in real-time from the Metaforge API.
2.  **Deep Knowledge Graph:** "Hydrates" items with Crafting Recipes, Project Requirements, and Recycling Yields using community-maintained static datasets.

## 🚀 Features

* **Live Dashboard:** Instantly browse items with current `Sell Value` and `Weight`.
* **Just-in-Time (JIT) Details:** Clicking an item fetches deep relationship data on demand.
* **Crafting Recipes:** Shows exact ingredients and Workbench requirements (e.g., "Requires Med Station").
* **Reverse Lookups:**
    * **"Used In Projects":** See which massive Caravan projects require this item.
    * **"Used In Upgrades":** Track items needed for Hideout upgrades.
    * **"Recycles Into":** Know exactly what you get before you scrap an item.
* **Trader Info:** Displays which trader sells the item and for how much.
* **Quest Linking:** Automatically links items to their related quests.

## 🛠️ Tech Stack

* **Framework:** React (Vite)
* **Language:** TypeScript
* **Styling:** CSS Modules / Custom CSS variables
* **Data Strategy:**
    * *List View:* `fetch('/api/arc-raiders/items')` (Live Proxy)
    * *Detail View:* `fetch('raw.githubusercontent.com/.../items/{id}.json')` (Static Fallback)

## 📦 Installation & Setup

1.  **Clone the repository**
    ```bash
    git clone [https://github.com/your-username/arc-raiders-wiki.git](https://github.com/your-username/arc-raiders-wiki.git)
    cd arc-raiders-wiki
    ```

2.  **Install Dependencies**
    ```bash
    npm install
    ```

3.  **Configure Proxy (Vite)**
    Ensure `vite.config.ts` is set up to handle CORS for the API:
    ```typescript
    // vite.config.ts
    proxy: {
      '/api': {
        target: '[https://metaforge.app](https://metaforge.app)',
        changeOrigin: true,
        secure: false,
      }
    }
    ```

4.  **Run Development Server**
    ```bash
    npm run dev
    ```

## 🤝 Credits & Data Sources

This project is not affiliated with Embark Studios. It relies on open-source community data:

* **Live API & Images:** [Metaforge](https://metaforge.app)
* **Static Data (Recipes/Trades):** [RaidTheory/arcraiders-data](https://github.com/RaidTheory/arcraiders-data) & [ARDB](https://github.com/Teyk0o/ARDB)

## 📄 License

MIT License. See [LICENSE](LICENSE) for more information.

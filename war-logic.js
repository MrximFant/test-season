window.warRoom = function() {
    return {
        // --- CONFIG ---
        sbUrl: '...', sbKey: '...',

        // --- STATE ---
        tab: 'warroom', loading: true, authenticated: false,
        alliances: [], // Now contains everything from Master View
        importData: '', importMode: 'scout', // 'scout', 'alliance', 'player'
        
        async init() {
            this.client = supabase.createClient(this.sbUrl, this.sbKey);
            
            // 1. Instant Load from Cache
            const cached = localStorage.getItem('war_data_cache');
            if (cached) {
                this.alliances = JSON.parse(cached);
                this.loading = false;
            }

            // 2. Background Fetch
            await this.fetchData();
        },

        async fetchData() {
            try {
                const { data, error } = await this.client.from('war_master_view').select('*');
                if (error) throw error;

                this.alliances = data.map(a => ({
                    id: a.id, server: a.server, tag: a.tag, name: a.name,
                    faction: a.faction, power: a.power,
                    rate: Number(a.hourly_rate || 0),
                    stash: Number(a.est_stash_now || 0),
                    warStash: Number(a.est_stash_war || 0),
                    aceTHP: a.ace_thp, members: a.member_count,
                    cities: { l1:a.l1, l2:a.l2, l3:a.l3, l4:a.l4, l5:a.l5, l6:a.l6 }
                }));

                // Update Cache
                localStorage.setItem('war_data_cache', JSON.stringify(this.alliances));
                this.debugStatus = "Intel Synced";
            } catch (e) { this.debugStatus = "Sync Error"; }
            this.loading = false;
        },

        // --- THE MULTI-MODE OCR PARSER ---
        async processImport() {
            const lines = this.importData.split('\n');
            let count = 0;

            for (const line of lines) {
                // This regex is flexible for [TAG] Name Numbers
                const match = line.match(/\[(.*?)\]\s+(.*?)\s+([\d,.]+)/);
                if (!match) continue;

                const [_, tag, name, valStr] = match;
                const val = parseInt(valStr.replace(/[,.]/g, ''));
                const alliance = this.alliances.find(a => a.tag.toLowerCase() === tag.toLowerCase());

                if (this.importMode === 'scout' && alliance) {
                    await this.client.from('history').insert({ alliance_id: alliance.id, copper: val });
                    await this.client.from('alliances').update({ name: name }).eq('id', alliance.id);
                    count++;
                }
                
                if (this.importMode === 'alliance') {
                    // This creates the alliance if it doesn't exist, or updates if it does
                    await this.client.from('alliances').upsert({ 
                        tag: tag, name: name, power: val, server: this.selectedServer 
                    }, { onConflict: 'server,tag' });
                    count++;
                }
            }
            alert(`Imported ${count} records.`);
            this.importData = '';
            await this.fetchData();
        },

        // --- GROUPING LOGIC (Using pre-calculated Stash) ---
        getGroupedFaction(fName) {
            const sorted = this.alliances
                .filter(a => a.faction.toLowerCase().includes(fName.toLowerCase()))
                .sort((a,b) => b.stash - a.stash);
            
            // Apply your Week 1 (10), Week 2 (6), etc. logic here
            const step = this.week === 1 ? 10 : (this.week === 2 ? 6 : 3);
            // ... (rest of your grouping logic)
        }
    }
}

<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
    <title>S4WARS | STRIKE COMMAND</title>
    <script src="https://cdn.tailwindcss.com"></script>
    <script src="https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2"></script>
    <script defer src="https://unpkg.com/alpinejs@3.x.x/dist/cdn.min.js"></script>
    <script src="war-logic.js"></script>
    <style>
        [x-cloak] { display: none !important; }
        body { background: #020617; color: #f8fafc; font-family: 'Inter', sans-serif; }
        .glass-card { background: rgba(15, 23, 42, 0.8); border: 1px solid rgba(51, 65, 85, 0.5); border-radius: 1.5rem; }
        .match-glow { border: 1.5px solid #fbbf24 !important; box-shadow: 0 0 15px rgba(251, 191, 36, 0.2); }
        .btn-strike { background: #1e293b; border: 1px solid #334155; transition: all 0.2s; color: #94a3b8; }
        .btn-strike.active { background: #0891b2; border-color: #22d3ee; color: white; }
        .star-active { color: #fbbf24; fill: #fbbf24; }
        .tag-badge { background: rgba(34, 211, 238, 0.1); color: #22d3ee; border: 1px solid rgba(34, 211, 238, 0.2); padding: 1px 4px; border-radius: 4px; font-size: 10px; font-weight: 800; }
        .faction-header-kage { border-left: 4px solid #ef4444; background: linear-gradient(90deg, rgba(239, 68, 68, 0.1) 0%, transparent 100%); }
        .faction-header-koubu { border-left: 4px solid #3b82f6; background: linear-gradient(90deg, rgba(59, 130, 246, 0.1) 0%, transparent 100%); }
    </style>
</head>
<body x-data="warRoom()" x-init="init()" class="pb-24 lg:pb-10">

    <!-- TACTICAL HEADER -->
    <header class="sticky top-0 z-50 glass-card mx-2 mt-2 p-4 flex justify-between items-center backdrop-blur-xl lg:max-w-7xl lg:mx-auto">
        <div class="flex items-center gap-3">
            <div class="h-10 w-1 bg-cyan-500 rounded-full"></div>
            <div>
                <h1 class="text-xl font-black tracking-tighter text-white uppercase italic leading-none">Strike_Cmd</h1>
                <p class="text-[10px] font-bold text-slate-500 uppercase tracking-widest mt-1" x-text="currentRoundText + ' | ' + currentPhase"></p>
            </div>
        </div>
        
        <!-- OPTIONAL REFERENCE SELECTOR (TOP) -->
        <div class="hidden lg:block relative w-64">
            <input type="text" x-model="refSearch" placeholder="Set My Alliance (Optional)..." class="w-full bg-black/40 border border-slate-800 p-2 rounded-xl text-[10px] text-cyan-400 outline-none uppercase font-bold italic">
            <div x-show="refSearch" class="absolute top-full left-0 w-full mt-1 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl z-[150] overflow-hidden">
                <template x-for="a in getFilteredRefList()">
                    <div @click="setReferenceAlliance(a.name)" class="p-2 text-[10px] hover:bg-cyan-600 cursor-pointer border-b border-slate-800 truncate font-bold uppercase"><span class="text-cyan-400" x-text="'[' + a.tag + '] '"></span><span x-text="a.name"></span></div>
                </template>
            </div>
            <div x-show="myAllianceName && !refSearch" class="mt-1 flex items-center justify-between bg-cyan-500/10 px-2 py-1 rounded text-[9px]">
                <span class="text-cyan-500 font-bold uppercase truncate" x-text="'Ref: ' + myAllianceName"></span>
                <button @click="myAllianceName = ''; localStorage.removeItem('war_ref_alliance')" class="text-red-500">✕</button>
            </div>
        </div>

        <div class="text-right">
            <p class="text-[10px] font-black text-amber-500 uppercase italic">Next War</p>
            <p class="text-xl font-mono font-black text-white leading-none" x-text="phaseCountdown"></p>
        </div>
    </header>

    <main class="p-4 lg:max-w-7xl lg:mx-auto">
        
        <!-- TOP CONTROLS -->
        <div class="flex items-center gap-2 mb-6 bg-slate-900/50 p-2 rounded-2xl border border-slate-800">
            <input type="text" x-model="searchQuery" placeholder="Filter Intel..." class="flex-1 bg-transparent p-3 text-sm focus:outline-none italic font-bold text-white">
            <button @click="tab = 'warroom'" :class="tab === 'warroom' ? 'text-cyan-400' : 'text-slate-600'" class="px-4 font-black text-xs uppercase italic">Hub</button>
            <button @click="tab = 'favorites'" :class="tab === 'favorites' ? 'text-amber-400' : 'text-slate-600'" class="px-4 font-black text-xs uppercase italic">Stars</button>
        </div>

        <!-- STANDINGS HUB -->
        <div x-show="tab === 'warroom'" class="grid grid-cols-1 lg:grid-cols-2 gap-8">
            <template x-for="faction in ['Kage', 'Koubu']">
                <div class="space-y-4">
                    <div class="p-3 rounded-xl font-black uppercase text-xs tracking-widest italic" :class="faction === 'Kage' ? 'faction-header-kage text-red-500' : 'faction-header-koubu text-blue-500'" x-text="faction + ' Standings'"></div>
                    
                    <template x-for="group in (faction === 'Kage' ? getGroupedFaction('Kage') : getGroupedFaction('Koubu'))">
                        <div class="space-y-2">
                            <div @click="toggleGroup(faction, group.id)" class="flex justify-between items-center p-3 bg-slate-900/40 rounded-xl border border-slate-800/50 cursor-pointer hover:bg-slate-800 transition-colors">
                                <span class="text-[10px] font-black uppercase text-slate-500" x-text="group.label"></span>
                                <span class="text-slate-600" x-text="isGroupOpen(faction, group.id) ? '▲' : '▼'"></span>
                            </div>

                            <div x-show="isGroupOpen(faction, group.id)" x-transition class="grid gap-4">
                                <template x-for="a in group.alliances">
                                    <div x-show="matchesSearch(a)" class="glass-card p-5 relative overflow-hidden flex flex-col justify-between" :class="isMatch(a) ? 'match-glow' : ''">
                                        
                                        <!-- Card Top -->
                                        <div class="flex justify-between items-start mb-4">
                                            <div class="flex-1">
                                                <div class="flex items-center gap-2 mb-1">
                                                    <button @click="toggleFavorite(a)" class="text-slate-700 hover:text-amber-400 transition-all">
                                                        <span :class="isFavorite(a) ? 'star-active' : ''">★</span>
                                                    </button>
                                                    <span class="tag-badge" x-text="a.tag"></span>
                                                    <h3 class="text-sm font-black text-white uppercase truncate max-w-[120px]" x-text="a.name"></h3>
                                                </div>
                                                <div class="flex flex-wrap gap-2 text-[9px] font-black uppercase text-slate-500 italic">
                                                    <span class="text-slate-400" x-text="'S' + a.server"></span>
                                                    <span class="text-cyan-600" x-text="formatPower(a.power)"></span>
                                                    <span class="text-emerald-500" x-text="'#' + a.factionRank"></span>
                                                </div>
                                            </div>
                                            <div class="text-right">
                                                <p class="text-[8px] font-black text-slate-500 uppercase">Ace THP</p>
                                                <p class="text-sm font-mono font-black text-amber-500" x-text="formatNum(a.ace_thp)"></p>
                                            </div>
                                        </div>

                                        <!-- Card Middle (Ace + Stash) -->
                                        <div class="flex justify-between items-center mb-4 bg-black/30 p-2 rounded-lg border border-slate-800">
                                            <div class="flex flex-col">
                                                <span class="text-[8px] text-slate-500 uppercase font-black">Top Player</span>
                                                <span class="text-[10px] font-bold text-white uppercase truncate max-w-[100px]" x-text="a.ace_name"></span>
                                            </div>
                                            <div class="text-right">
                                                <span class="text-[8px] text-slate-500 uppercase font-black italic">Live Stash</span>
                                                <p class="text-sm font-mono font-black text-white" x-text="formatNum(a.stash)"></p>
                                            </div>
                                        </div>

                                        <!-- Card Strike Planner -->
                                        <div class="bg-slate-900/60 rounded-xl p-3 border border-slate-800">
                                            <div class="flex justify-between items-end mb-3">
                                                <div class="grid grid-cols-4 gap-1">
                                                    <button @click="toggleBuilding(a.id, 0)" :class="strikePlan[a.id]?.includes(0) ? 'active' : ''" class="btn-strike w-8 h-7 rounded text-[8px] font-black">W1</button>
                                                    <button @click="toggleBuilding(a.id, 1)" :class="strikePlan[a.id]?.includes(1) ? 'active' : ''" class="btn-strike w-8 h-7 rounded text-[8px] font-black">W2</button>
                                                    <button @click="toggleBuilding(a.id, 2)" :class="strikePlan[a.id]?.includes(2) ? 'active' : ''" class="btn-strike w-8 h-7 rounded text-[8px] font-black">W3</button>
                                                    <button @click="toggleBuilding(a.id, 3)" :class="strikePlan[a.id]?.includes(3) ? 'active' : ''" class="btn-strike w-10 h-7 rounded text-[8px] font-black">CTR</button>
                                                </div>
                                                <div class="text-right">
                                                    <span class="text-[7px] font-black text-amber-500 uppercase italic" x-text="(strikePlan[a.id]?.length > 0) ? 'Strike Value' : 'Max (15%)'"></span>
                                                    <p class="text-base font-mono font-black text-amber-400" x-text="formatNum(getPlannedPlunder(a))"></p>
                                                </div>
                                            </div>
                                        </div>

                                        <div class="flex justify-between items-center mt-3">
                                            <div class="text-[8px] font-bold text-slate-600 uppercase">Rate: <span class="text-slate-400" x-text="'+' + formatNum(a.rate) + '/h'"></span></div>
                                            <button @click="openComparison(a)" class="text-[9px] font-black text-cyan-400 uppercase italic underline underline-offset-4">Compare Rosters</button>
                                        </div>

                                    </div>
                                </template>
                            </div>
                        </div>
                    </template>
                </div>
            </template>
        </div>

        <!-- FAVORITES TAB -->
        <div x-show="tab === 'favorites'" class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            <template x-for="a in favorites.map(f => processedAlliances.find(pa => pa.id === f.id)).filter(x => x)">
                <!-- Same Card Template as above -->
                <div class="glass-card p-5 relative">
                    <!-- Identity -->
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex items-center gap-2">
                            <span class="tag-badge" x-text="a.tag"></span>
                            <h3 class="text-sm font-black text-white uppercase truncate max-w-[120px]" x-text="a.name"></h3>
                        </div>
                        <button @click="toggleFavorite(a)" class="star-active text-xl">★</button>
                    </div>
                    <!-- Strike Logic (Repeat same as above) -->
                    <div class="bg-black/40 rounded-xl p-3 border border-slate-800">
                        <p class="text-[8px] text-slate-500 uppercase italic mb-1">Live Stash</p>
                        <p class="text-lg font-mono font-black text-white mb-2" x-text="formatNum(a.stash)"></p>
                        <div class="flex justify-between items-center">
                            <span class="text-[8px] font-black text-amber-500 uppercase">Strike Est.</span>
                            <p class="text-sm font-mono font-black text-amber-400" x-text="formatNum(getPlannedPlunder(a))"></p>
                        </div>
                    </div>
                </div>
            </template>
        </div>

        <!-- ADMIN TAB -->
        <div x-show="tab === 'admin'" class="max-w-xl mx-auto pt-6">
            <div x-show="!authenticated" class="glass-card p-10 text-center">
                <input type="password" x-model="passInput" placeholder="Auth Key" class="w-full bg-black border border-slate-800 p-4 rounded-xl text-center mb-4 text-white uppercase">
                <button @click="login()" class="w-full bg-red-600 py-4 rounded-xl font-black uppercase">Verify Command</button>
            </div>
            <div x-show="authenticated" class="space-y-6">
                <div class="glass-card p-6 border-cyan-500/20">
                    <h3 class="font-black uppercase text-cyan-500 mb-4 tracking-widest">Database Sync</h3>
                    <textarea x-model="importData" rows="6" class="w-full bg-black p-4 rounded-xl font-mono text-xs text-cyan-400 border border-slate-800 outline-none mb-4" placeholder="Paste Scout JSON..."></textarea>
                    <button @click="processImport()" :disabled="isImporting" class="w-full bg-emerald-600 py-4 rounded-xl font-black uppercase text-xs tracking-widest">Update Alliances</button>
                </div>
            </div>
        </div>
    </main>

    <!-- MOBILE NAVIGATION DOCK -->
    <nav class="lg:hidden fixed bottom-6 left-1/2 -translate-x-1/2 glass-card px-10 py-4 flex gap-12 backdrop-blur-2xl shadow-2xl z-50 border-cyan-500/20">
        <button @click="tab = 'warroom'" :class="tab === 'warroom' ? 'text-cyan-400' : 'text-slate-600'"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg></button>
        <button @click="tab = 'admin'" :class="tab === 'admin' ? 'text-red-500' : 'text-slate-600'"><svg class="w-6 h-6" fill="currentColor" viewBox="0 0 24 24"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg></button>
    </nav>

    <!-- ROSTER MODAL -->
    <div x-show="comparisonTarget" class="fixed inset-0 z-[200] flex items-end lg:items-center justify-center p-0 lg:p-4" x-cloak>
        <div class="absolute inset-0 bg-black/95 backdrop-blur-md" @click="comparisonTarget = null"></div>
        <div class="relative bg-slate-900 w-full max-w-4xl h-[75vh] lg:h-auto lg:max-h-[80vh] rounded-t-[3rem] lg:rounded-[2rem] border-t lg:border border-slate-700 flex flex-col overflow-hidden shadow-2xl">
            <div class="p-6 border-b border-slate-800 flex justify-between items-center">
                <h3 class="text-sm font-black italic uppercase text-amber-500 tracking-widest">Strategic Comparison</h3>
                <button @click="comparisonTarget = null" class="text-slate-400 p-2 text-xl">✕</button>
            </div>
            <div class="flex-1 overflow-y-auto p-4 grid grid-cols-2 gap-4 scrollbar-hide">
                <template x-if="comparisonTarget && comparisonTarget.me">
                    <div class="space-y-2">
                        <div class="text-[9px] font-black text-cyan-400 uppercase text-center mb-2" x-text="comparisonTarget.me.name"></div>
                        <template x-for="p in comparisonTarget.me.roster">
                            <div class="flex justify-between text-[10px] font-mono border-b border-slate-800/50 pb-1"><span class="truncate pr-1" x-text="p.name"></span><span class="text-cyan-500" x-text="formatNum(p.thp)"></span></div>
                        </template>
                    </div>
                </template>
                <div class="space-y-2">
                    <div class="text-[9px] font-black text-red-400 uppercase text-center mb-2" x-text="comparisonTarget.them.name"></div>
                    <template x-for="p in comparisonTarget.them.roster">
                        <div class="flex justify-between text-[10px] font-mono border-b border-slate-800/50 pb-1"><span class="truncate pr-1" x-text="p.name"></span><span class="text-red-500" x-text="formatNum(p.thp)"></span></div>
                    </template>
                </div>
            </div>
        </div>
    </div>

</body>
</html>

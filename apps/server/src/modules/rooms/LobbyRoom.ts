import colyseus from 'colyseus';
const { Room } = colyseus;
import type { Client } from 'colyseus';
import { Schema, type, MapSchema, ArraySchema } from "@colyseus/schema";
import { PlayerState as SharedPlayerState, ItemRarity, RarityConfigs, Item as SharedItem, calculateItemDamage } from "@medieval-patterns/shared";

export class ItemSchema extends Schema implements SharedItem {
    @type("string") id: string = "";
    @type("string") ownerId: string = "";
    @type("string") rarity: ItemRarity = ItemRarity.Common;
    @type("boolean") isAppraised: boolean = false;
    @type("number") floatVal?: number;
    @type("number") patternSeed?: number;
}

export class Player extends Schema implements SharedPlayerState {
    @type("string") id: string = "";
    @type("string") name: string = "Player";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("number") rotation: number = 0;
    @type("number") hp: number = 100;
    @type("number") maxHp: number = 100;
    @type("number") stamina: number = 100;
    @type("boolean") isDodging: boolean = false;
    @type("number") gold: number = 0;
    @type("string") equippedWeaponId: string = "";
    @type("number") baseDamage: number = 15;
    @type("number") critChance: number = 0.15;
    @type("number") critMult: number = 1.6;
    @type([ItemSchema]) inventory = new ArraySchema<ItemSchema>();
}

export class Boss extends Schema {
    @type("string") id: string = "boss-1";
    @type("number") x: number = 5;
    @type("number") z: number = 5;
    @type("number") hp: number = 600;
    @type("number") maxHp: number = 600;
    @type("string") phase: "normal" | "enraged" = "normal";
    @type("boolean") isTelegraphing: boolean = false;
    @type("number") telegraphRadius: number = 0;
    @type("number") telegraphPositionX: number = 0;
    @type("number") telegraphPositionZ: number = 0;
}

export class LootDrop extends Schema {
    @type("string") id: string = "";
    @type("number") x: number = 0;
    @type("number") z: number = 0;
    @type("string") ownerId: string = "";
    @type("string") rarity: ItemRarity = ItemRarity.Common;
    @type("number") floatVal: number = 0;
    @type("number") patternSeed: number = 0;
    @type("boolean") isAppraised: boolean = false;
}

export class LobbyState extends Schema {
    @type({ map: Player }) players = new MapSchema<Player>();
    @type(Boss) boss = new Boss();
    @type({ map: LootDrop }) lootDrops = new MapSchema<LootDrop>();
}

export class LobbyRoom extends Room<LobbyState> {
    maxClients = 8;
    fixedTimeStep = 1000 / 60;
    playersWhoDamagedBoss = new Set<string>();

    onCreate(options: any) {
        console.log("LobbyRoom created!", options);
        this.setState(new LobbyState());

        this.onMessage("move", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player) {
                // simple interpolation logic can be handled on client
                player.x = data.x;
                player.z = data.z;
                player.rotation = data.rotation; // client rotation (mouse aim angle)
            }
        });

        this.onMessage("dodge", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (player && !player.isDodging && player.stamina >= 30) {
                player.isDodging = true;
                player.stamina -= 30;

                this.clock.setTimeout(() => {
                    if (this.state.players.has(client.sessionId)) {
                        this.state.players.get(client.sessionId)!.isDodging = false;
                    }
                }, 300); // 0.3s iframe as requested
            }
        });

        this.onMessage("attack", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player || player.isDodging) return;

            const attackAngle = data.angle; // sent from client mouse aim
            const reach = 3.5;
            const arc = Math.PI / 2; // 90 degree cone

            const boss = this.state.boss;
            if (boss.hp > 0) {
                const dx = boss.x - player.x;
                const dz = boss.z - player.z;
                const distSq = dx * dx + dz * dz;

                if (distSq <= reach * reach) {
                    const angleToBoss = Math.atan2(dz, dx);
                    // normalize angles
                    let diff = angleToBoss - attackAngle;
                    while (diff < -Math.PI) diff += Math.PI * 2;
                    while (diff > Math.PI) diff -= Math.PI * 2;

                    if (Math.abs(diff) <= arc / 2) {
                        // Calculate damage
                        let dmg = player.baseDamage;
                        
                        // Apply equipped weapon damage if any
                        if (player.equippedWeaponId) {
                           const weapon = player.inventory.find(i => i.id === player.equippedWeaponId);
                           if (weapon && weapon.isAppraised) {
                               dmg = calculateItemDamage(weapon.rarity, weapon.floatVal!);
                           }
                        }

                        let isCrit = Math.random() < player.critChance;
                        if (isCrit) dmg *= player.critMult;

                        dmg = Math.floor(dmg);

                        boss.hp -= dmg;
                        this.playersWhoDamagedBoss.add(player.id);
                        
                        // Broadcast damage number
                        this.broadcast("damage_text", {
                            id: boss.id,
                            amount: dmg,
                            isCrit: isCrit,
                            x: boss.x,
                            y: 4, // floating height
                            z: boss.z
                        });

                        if (boss.hp <= 600 * 0.4 && boss.phase === "normal") {
                            boss.phase = "enraged";
                        }

                        if (boss.hp <= 0) {
                            this.handleBossDeath();
                        }
                    }
                }
            }
        });

        this.onMessage("pickup_item", (client, data) => {
            const player = this.state.players.get(client.sessionId);
            if (!player) return;
            const drop = this.state.lootDrops.get(data.itemId);
            
            if (drop && drop.ownerId === player.id) {
                const dx = player.x - drop.x;
                const dz = player.z - drop.z;
                if (dx * dx + dz * dz < 4) { // within pickup range
                    const item = new ItemSchema();
                    item.id = drop.id;
                    item.ownerId = drop.ownerId;
                    item.rarity = drop.rarity;
                    item.floatVal = drop.floatVal;
                    item.patternSeed = drop.patternSeed;
                    item.isAppraised = false;
                    
                    player.inventory.push(item);
                    this.state.lootDrops.delete(drop.id);
                }
            }
        });

        this.onMessage("appraise_item", (client, data) => {
             const player = this.state.players.get(client.sessionId);
             if (!player) return;

             const item = player.inventory.find(i => i.id === data.itemId);
             if (item && !item.isAppraised) {
                 const cost = RarityConfigs[item.rarity].appraisalCost;
                 if (player.gold >= cost) {
                     player.gold -= cost;
                     item.isAppraised = true;
                     // stats are already on the item from drop time, just marked as appraised now
                     client.send("appraise_success", { itemId: item.id });
                 }
             }
        });

        this.onMessage("equip_item", (client, data) => {
             const player = this.state.players.get(client.sessionId);
             if (!player) return;

             const item = player.inventory.find(i => i.id === data.itemId);
             if (item && item.isAppraised) {
                 player.equippedWeaponId = item.id;
             }
        });

        this.setSimulationInterval((deltaTime) => this.update(deltaTime), this.fixedTimeStep);

        this.clock.setInterval(() => this.bossAI(), 1500); // More aggressive AI ticks
    }

    update(deltaTime: number) {
        this.state.players.forEach((player) => {
            if (player.stamina < 100 && !player.isDodging) {
                player.stamina = Math.min(100, player.stamina + 25 * (deltaTime/1000)); // 25 stamina per second
            }
        });
    }

    bossAI() {
        if (this.state.boss.hp <= 0) return;

        const players = Array.from(this.state.players.values());
        if (players.length === 0) return;

        // Find closest player
        let closestPlayer: any = null;
        let minDistSq = Infinity;

        players.forEach(p => {
            const dx = p.x - this.state.boss.x;
            const dz = p.z - this.state.boss.z;
            const distSq = dx * dx + dz * dz;
            if (distSq < minDistSq) {
                minDistSq = distSq;
                closestPlayer = p;
            }
        });

        if (closestPlayer && !this.state.boss.isTelegraphing) {
            // Move towards player
            const speed = this.state.boss.phase === "enraged" ? 5 : 3;
            
            if (minDistSq > 16) { // Distance 4
                const dx = closestPlayer.x - this.state.boss.x;
                const dz = closestPlayer.z - this.state.boss.z;
                const dist = Math.sqrt(minDistSq);
                
                this.state.boss.x += (dx / dist) * speed * (this.fixedTimeStep/1000) * 10;
                this.state.boss.z += (dz / dist) * speed * (this.fixedTimeStep/1000) * 10;
            } else if (minDistSq <= 16) {
                // Attack
                this.state.boss.isTelegraphing = true;
                this.state.boss.telegraphRadius = 4;
                this.state.boss.telegraphPositionX = closestPlayer.x;
                this.state.boss.telegraphPositionZ = closestPlayer.z;

                const delay = 1200; // 1.2s charge
                this.clock.setTimeout(() => {
                    this.executeBossAttack();
                }, delay);
            }
        }
    }

    executeBossAttack() {
        if (this.state.boss.hp <= 0) {
            this.state.boss.isTelegraphing = false;
            return;
        }

        const attackX = this.state.boss.telegraphPositionX;
        const attackZ = this.state.boss.telegraphPositionZ;
        const radius = this.state.boss.telegraphRadius;

        this.state.players.forEach((player) => {
            if (!player.isDodging) {
                const dx = player.x - attackX;
                const dz = player.z - attackZ;
                const distSq = dx * dx + dz * dz;

                if (distSq <= radius * radius) {
                    player.hp -= 45; // AoE Slam damage
                    this.broadcast("damage_text", {
                         id: player.id,
                         amount: 45,
                         isCrit: false,
                         x: player.x,
                         y: 2,
                         z: player.z
                    });

                    if (player.hp <= 0) {
                        player.hp = player.maxHp; // respawn
                        player.x = 0; player.z = 0;
                    }
                }
            }
        });

        this.state.boss.isTelegraphing = false;
    }

    onJoin(client: Client, options: any) {
        console.log(client.sessionId, "joined with options:", options);
        const player = new Player();
        player.id = client.sessionId;
        player.name = options.name || `Player-${client.sessionId.substring(0, 4)}`;
        // Spawn near boss but not on top
        player.x = Math.random() * 10 - 5;
        player.z = 10;
        this.state.players.set(client.sessionId, player);
    }

    onLeave(client: Client, consented: boolean) {
        this.state.players.delete(client.sessionId);
        this.playersWhoDamagedBoss.delete(client.sessionId);
    }

    handleBossDeath() {
        this.state.boss.isTelegraphing = false;

        this.playersWhoDamagedBoss.forEach(playerId => {
            const player = this.state.players.get(playerId);
            if (player) {
                // Gold drop (50-100)
                player.gold += Math.floor(Math.random() * 51) + 50;

                // 1-3 items
                const numItems = Math.floor(Math.random() * 3) + 1;
                for (let i = 0; i < numItems; i++) {
                    const loot = this.generateLootDrop(playerId, this.state.boss.x, this.state.boss.z);
                    this.state.lootDrops.set(loot.id, loot);
                }
            }
        });

        this.playersWhoDamagedBoss.clear();

        // Respawn boss after 10 seconds
        this.clock.setTimeout(() => {
            this.state.boss.hp = this.state.boss.maxHp;
            this.state.boss.phase = "normal";
            this.state.boss.x = 5;
            this.state.boss.z = 5;
        }, 10000);
    }

    generateLootDrop(ownerId: string, bx: number, bz: number) {
        const rand = Math.random() * 100;
        let rarity = ItemRarity.Common;

        let cumulative = 0;
        const tiers = [
            ItemRarity.Mythic, ItemRarity.Elite, ItemRarity.Epic,
            ItemRarity.Rare, ItemRarity.Uncommon, ItemRarity.Common
        ];

        for (const r of tiers) {
            cumulative += RarityConfigs[r].dropChance;
            if (rand <= cumulative) {
                rarity = r;
                break;
            }
        }

        const floatVal = Math.pow(Math.random(), 3); 
        const patternSeed = Math.floor(Math.random() * 999) + 1;

        const drop = new LootDrop();
        drop.id = Math.random().toString(36).substring(7);
        drop.ownerId = ownerId;
        drop.rarity = rarity;
        drop.floatVal = floatVal;
        drop.patternSeed = patternSeed;
        
        // Scatter around boss
        drop.x = bx + (Math.random() * 4 - 2);
        drop.z = bz + (Math.random() * 4 - 2);

        return drop;
    }
}

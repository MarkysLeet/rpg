export enum ItemRarity {
    Common = "Common",
    Uncommon = "Uncommon",
    Rare = "Rare",
    Epic = "Epic",
    Elite = "Elite",
    Mythic = "Mythic"
}

export interface BaseItemConfig {
    rarity: ItemRarity;
    color: string;
    minDamage: number;
    maxDamage: number;
    appraisalCost: number;
    dropChance: number;
}

export const RarityConfigs: Record<ItemRarity, BaseItemConfig> = {
    [ItemRarity.Common]: { rarity: ItemRarity.Common, color: "#9E9E9E", minDamage: 12, maxDamage: 16, appraisalCost: 15, dropChance: 50.0 },
    [ItemRarity.Uncommon]: { rarity: ItemRarity.Uncommon, color: "#4CAF50", minDamage: 22, maxDamage: 30, appraisalCost: 35, dropChance: 30.0 },
    [ItemRarity.Rare]: { rarity: ItemRarity.Rare, color: "#2196F3", minDamage: 38, maxDamage: 50, appraisalCost: 75, dropChance: 14.0 },
    [ItemRarity.Epic]: { rarity: ItemRarity.Epic, color: "#9C27B0", minDamage: 65, maxDamage: 85, appraisalCost: 150, dropChance: 4.8 },
    [ItemRarity.Elite]: { rarity: ItemRarity.Elite, color: "#FF9800", minDamage: 110, maxDamage: 140, appraisalCost: 300, dropChance: 1.1 },
    [ItemRarity.Mythic]: { rarity: ItemRarity.Mythic, color: "#FF1744", minDamage: 180, maxDamage: 230, appraisalCost: 600, dropChance: 0.1 }
};

export interface Item {
    id: string;
    ownerId: string;
    rarity: ItemRarity;
    isAppraised: boolean;
    floatVal?: number; // 0.0000001 to 0.9999999
    patternSeed?: number; // 1 to 999
}

export interface PlayerState {
    id: string;
    name: string;
    x: number;
    z: number;
    rotation: number;
    hp: number;
    maxHp: number;
    stamina: number;
    isDodging: boolean;
    gold: number;
    equippedWeaponId: string; // no undefined to make schema easy
    baseDamage: number;
    critChance: number;
    critMult: number;
}

export interface BossState {
    id: string;
    x: number;
    z: number;
    hp: number;
    maxHp: number;
    phase: "normal" | "enraged";
    isTelegraphing: boolean;
    telegraphRadius?: number;
    telegraphPositionX?: number;
    telegraphPositionZ?: number;
}

export interface LootDropState {
    id: string;
    x: number;
    z: number;
    ownerId: string;
    rarity: ItemRarity;
    floatVal: number;
    patternSeed: number;
    isAppraised: boolean;
}

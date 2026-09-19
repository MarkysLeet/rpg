import { ItemRarity, RarityConfigs } from "./types.js";

export const calculateFloatBonus = (floatVal: number): number => {
    // 0.0000001 (Perfect) gives ~25% bonus. 0.9999999 (Worst) gives ~0% bonus.
    return (1.0 - floatVal) * 0.25;
};

export const calculateItemDamage = (rarity: ItemRarity, floatVal: number): number => {
    const config = RarityConfigs[rarity];
    const bonus = calculateFloatBonus(floatVal);
    
    // In this simplified version, let's say the float bonus applies to maxDamage
    return config.minDamage + ((config.maxDamage - config.minDamage) * (1.0 + bonus));
}

export const getAuraHue = (patternSeed: number): number => {
    return (patternSeed * 137.5) % 360;
}

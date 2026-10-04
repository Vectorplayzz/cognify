import React from 'react';
import { Brain, Compass, Crown, Flame, Gem, Rocket, Star, Target, Award } from 'lucide-react';

const REWARD_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
    star: Star, flame: Flame, gem: Gem, rocket: Rocket, crown: Crown, brain: Brain, target: Target, compass: Compass,
};

export function RewardIcon({ name, className }: { name: string; className?: string }) {
    const Icon = REWARD_ICONS[name] || Award;
    return <Icon className={className} />;
}

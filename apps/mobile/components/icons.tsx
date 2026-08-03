import Svg, { Circle, Path, Rect } from 'react-native-svg';

export interface IconProps {
  size?: number;
  color?: string;
  strokeWidth?: number;
}

const defaults = { size: 22, color: '#111418', strokeWidth: 1.9 };

export function HomeIcon({ size = defaults.size, color = defaults.color, strokeWidth = 2.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M4 10.5 12 4l8 6.5V20H4z" />
    </Svg>
  );
}

export function ListIcon({ size = defaults.size, color = defaults.color, strokeWidth = 2.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={4} y={4} width={16} height={16} rx={3} />
      <Path d="M8 9.5h8M8 14.5h5" />
    </Svg>
  );
}

export function CalendarIcon({ size = defaults.size, color = defaults.color, strokeWidth = 2.3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={4} y={6} width={16} height={14} rx={3} />
      <Path d="M8 4v4M16 4v4M4 11h16" />
    </Svg>
  );
}

export function PersonIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={9} r={3.4} />
      <Path d="M5.5 20a6.5 6.5 0 0 1 13 0" />
    </Svg>
  );
}

export function BellIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.8 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M18 9a6 6 0 1 0-12 0c0 5-2 6-2 6h16s-2-1-2-6" />
      <Path d="M10.5 20a2 2 0 0 0 3 0" />
    </Svg>
  );
}

export function SearchIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={11} cy={11} r={6.5} />
      <Path d="m16 16 4 4" />
    </Svg>
  );
}

export function FilterIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 6h16l-6 7v6l-4-2v-4z" />
    </Svg>
  );
}

export function BackIcon({ size = defaults.size, color = defaults.color, strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m14.5 5-7 7 7 7" />
    </Svg>
  );
}

export function ChevronRightIcon({ size = 16, color = '#9AA1AA', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m9.5 5 7 7-7 7" />
    </Svg>
  );
}

export function ShareIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M12 16V4m0 0L8 8m4-4 4 4" />
      <Path d="M5 15v4a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-4" />
    </Svg>
  );
}

export function StarIcon({ size = 20, color = '#8E959D', filled = false }: IconProps & { filled?: boolean }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={filled ? '#F5B21B' : 'none'} stroke={filled ? '#F5B21B' : color} strokeWidth={1.6} strokeLinejoin="round">
      <Path d="m12 4 2.5 5.2 5.5.8-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.5-.8z" />
    </Svg>
  );
}

export function ClockIcon({ size = 13, color = '#C62A20', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function CheckCircleIcon({ size = 15, color = '#fff', strokeWidth = 3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function CheckIcon({ size = 15, color = '#0A8F4D', strokeWidth = 3 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="m5 12.5 4.5 4.5L19 7.5" />
    </Svg>
  );
}

export function MoreIcon({ size = 20, color = '#111418' }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
      <Circle cx={12} cy={5.5} r={1.7} />
      <Circle cx={12} cy={12} r={1.7} />
      <Circle cx={12} cy={18.5} r={1.7} />
    </Svg>
  );
}

export function PlusIcon({ size = 17, color = '#0A8F4D', strokeWidth = 2.4 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M12 6v12M6 12h12" />
    </Svg>
  );
}

export function PencilIcon({ size = 16, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M16.5 3.5a2.12 2.12 0 0 1 3 3L7 19l-4 1 1-4Z" />
    </Svg>
  );
}

export function WarningIcon({ size = 19, color = '#A66A00', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M12 8.5v5" />
      <Path d="M12 16.8h.01" />
      <Circle cx={12} cy={12} r={8.5} />
    </Svg>
  );
}

export function OfflineIcon({ size = 34, color = '#C62A20', strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 6l16 12" />
      <Path d="M12 18.5h.01" />
      <Path d="M5.5 9.5A11 11 0 0 1 12 7.5c2.4 0 4.7.8 6.5 2" />
      <Path d="M8 13a7 7 0 0 1 8 0" />
    </Svg>
  );
}

export function RefreshIcon({ size = 17, color = '#fff', strokeWidth = 2.2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M19 12a7 7 0 1 1-2.4-5.3" />
      <Path d="M19.5 4v4h-4" />
    </Svg>
  );
}

export function ChartEmptyIcon({ size = 34, color = '#5A6169', strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 19h16" />
      <Path d="M7 19v-5M12 19v-9M17 19v-3" />
    </Svg>
  );
}

export function GearIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={3.2} />
      <Path d="M12 3.5v2.3M12 18.2v2.3M4.5 12H6.8M17.2 12h2.3M6.7 6.7l1.6 1.6M15.7 15.7l1.6 1.6M17.3 6.7l-1.6 1.6M8.3 15.7l-1.6 1.6" />
    </Svg>
  );
}

export function HelpIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M9.8 9.3A2.2 2.2 0 0 1 14 10c0 1.5-2 1.8-2 3" />
      <Path d="M12 16.3h.01" />
    </Svg>
  );
}

export function BackupIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Path d="M4 8.5C4 6.6 7.6 5 12 5s8 1.6 8 3.5-3.6 3.5-8 3.5-8-1.6-8-3.5z" />
      <Path d="M4 8.5v7c0 1.9 3.6 3.5 8 3.5s8-1.6 8-3.5v-7" />
    </Svg>
  );
}

export function HeartIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Path d="m12 4 2.4 5 5.6.8-4 4 1 5.6-5-2.8-5 2.8 1-5.6-4-4 5.6-.8z" />
    </Svg>
  );
}

export function TrophyIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Circle cx={12} cy={12} r={8.5} />
      <Path d="M12 7.5V12l3 2" />
    </Svg>
  );
}

export function ExternalLinkIcon({ size = 15, color = '#0A8F4D', strokeWidth = 2 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M14 4h6v6" />
      <Path d="M20 4 11 13" />
      <Path d="M18 14v5a1 1 0 0 1-1 1H5a1 1 0 0 1-1-1V7a1 1 0 0 1 1-1h5" />
    </Svg>
  );
}

export function PhoneIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round">
      <Rect x={6.5} y={3} width={11} height={18} rx={2.5} />
      <Path d="M11 18.5h2" />
    </Svg>
  );
}

export function MailIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinejoin="round">
      <Rect x={3.5} y={6} width={17} height={12} rx={2.5} />
      <Path d="m4 7.5 8 5.5 8-5.5" />
    </Svg>
  );
}

export function MoonIcon({ size = defaults.size, color = defaults.color, strokeWidth = 1.9 }: IconProps) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={color} strokeWidth={strokeWidth} strokeLinecap="round" strokeLinejoin="round">
      <Path d="M20 14.5A8 8 0 0 1 9.5 4a8.5 8.5 0 1 0 10.5 10.5z" />
    </Svg>
  );
}

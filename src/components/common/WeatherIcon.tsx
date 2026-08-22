import React from 'react';
import {
  Sun,
  Moon,
  CloudSun,
  CloudMoon,
  Cloud,
  CloudRain,
  CloudDrizzle,
  CloudLightning,
  CloudSnow,
  CloudFog,
  Wind,
} from 'lucide-react';

interface WeatherIconProps {
  symbolCode?: string | null;
  className?: string;
  size?: number;
}

export const WeatherIcon: React.FC<WeatherIconProps> = ({
  symbolCode = 'cloudy',
  className = 'w-6 h-6',
  size = 24,
}) => {
  if (!symbolCode) return <Cloud className={className} size={size} />;

  const isNight = symbolCode.includes('_night');
  const clean = symbolCode.replace(/_(day|night|polartwilight)$/, '');

  switch (clean) {
    case 'clearsky':
      return isNight ? (
        <Moon className={`text-indigo-300 ${className}`} size={size} />
      ) : (
        <Sun className={`text-amber-400 animate-pulse ${className}`} size={size} />
      );

    case 'fair':
    case 'partlycloudy':
      return isNight ? (
        <CloudMoon className={`text-indigo-200 ${className}`} size={size} />
      ) : (
        <CloudSun className={`text-amber-300 ${className}`} size={size} />
      );

    case 'cloudy':
      return <Cloud className={`text-slate-300 ${className}`} size={size} />;

    case 'rainshowers':
    case 'lightrainshowers':
    case 'lightrain':
      return <CloudDrizzle className={`text-cyan-400 ${className}`} size={size} />;

    case 'rain':
    case 'heavyrain':
    case 'heavyrainshowers':
      return <CloudRain className={`text-blue-400 ${className}`} size={size} />;

    case 'rainandthunder':
    case 'heavyrainandthunder':
    case 'rainshowersandthunder':
    case 'lightrainandthunder':
      return <CloudLightning className={`text-yellow-400 ${className}`} size={size} />;

    case 'snow':
    case 'snowshowers':
    case 'heavysnow':
    case 'lightsnow':
    case 'sleet':
    case 'sleetshowers':
      return <CloudSnow className={`text-blue-200 ${className}`} size={size} />;

    case 'fog':
      return <CloudFog className={`text-slate-400 ${className}`} size={size} />;

    default:
      return <Cloud className={`text-slate-300 ${className}`} size={size} />;
  }
};

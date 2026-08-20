import React from 'react';

interface IconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
  className?: string;
}

// 1. BESPOKE SPREADSHEET MATRIX / GRID ICON
export const BespokeGridIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="2.5" y="2.5" width="19" height="19" rx="3.5" stroke="currentColor" strokeWidth="1.5" className="opacity-40" />
    <path d="M2.5 8.5H21.5" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
    <path d="M2.5 15.5H21.5" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
    <path d="M8.5 2.5V21.5" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
    <path d="M15.5 2.5V21.5" stroke="currentColor" strokeWidth="1.5" className="opacity-80" />
    <circle cx="5.5" cy="5.5" r="1.5" fill="currentColor" className="text-emerald-400" />
  </svg>
);

// 2. BESPOKE POWER QUERY NEURAL ETL ICON
export const BespokeQueryIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <circle cx="5" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
    <circle cx="19" cy="6" r="3" stroke="currentColor" strokeWidth="1.5" fill="currentColor" fillOpacity="0.2" />
    <circle cx="12" cy="18" r="3.5" stroke="currentColor" strokeWidth="1.75" fill="currentColor" fillOpacity="0.3" className="text-indigo-400" />
    <path d="M7.5 7.5L10 15M16.5 7.5L14 15" stroke="currentColor" strokeWidth="1.5" strokeDasharray="2 2" />
    <path d="M12 11V14.5" stroke="currentColor" strokeWidth="1.5" />
  </svg>
);

// 3. BESPOKE POWER BI ANALYTICS TELEMETRY ICON
export const BespokeAnalyticsIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="3" y="13" width="4" height="8" rx="1.5" fill="currentColor" fillOpacity="0.4" stroke="currentColor" strokeWidth="1.25" />
    <rect x="10" y="8" width="4" height="13" rx="1.5" fill="currentColor" fillOpacity="0.7" stroke="currentColor" strokeWidth="1.25" />
    <rect x="17" y="3" width="4" height="18" rx="1.5" fill="currentColor" stroke="currentColor" strokeWidth="1.25" className="text-amber-400" />
    <path d="M5 10L12 5L19 2" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" className="text-amber-300 opacity-80" />
  </svg>
);

// 4. BESPOKE FX FORMULA TERMINAL ICON
export const BespokeFormulaIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="3" y="3" width="18" height="18" rx="4" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.1" />
    <path
      d="M7 8C8.5 8 9.5 7 10 5.5H12M9 12H12M10.5 8.5L8 18.5M14 11.5L18 16.5M18 11.5L14 16.5"
      stroke="currentColor"
      strokeWidth="1.75"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

// 5. BESPOKE MERGE / JOIN QUERIES ICON
export const BespokeMergeIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <rect x="2" y="4" width="9" height="16" rx="2" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.15" />
    <rect x="13" y="4" width="9" height="16" rx="2" stroke="currentColor" strokeWidth="1.25" fill="currentColor" fillOpacity="0.15" />
    <path d="M8 12H16M16 12L13 9M16 12L13 15" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-400" />
  </svg>
);

// 6. BESPOKE HARDWARE LIGHTNING SPARK ICON
export const BespokeSparkIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path
      d="M13 2L4 14H12L11 22L20 10H12L13 2Z"
      fill="currentColor"
      fillOpacity="0.2"
      stroke="currentColor"
      strokeWidth="1.5"
      strokeLinejoin="round"
    />
  </svg>
);

// 7. BESPOKE LASER EXPORT ICON
export const BespokeExportIcon: React.FC<IconProps> = ({ size = 20, className = '', ...props }) => (
  <svg
    width={size}
    height={size}
    viewBox="0 0 24 24"
    fill="none"
    xmlns="http://www.w3.org/2000/svg"
    className={className}
    {...props}
  >
    <path d="M4 16V19C4 20.1046 4.89543 21 6 21H18C19.1046 21 20 20.1046 20 19V16" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M12 3V15M12 15L7.5 10.5M12 15L16.5 10.5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-emerald-400" />
  </svg>
);

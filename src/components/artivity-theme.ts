export function artivityTheme(dark: boolean) {
  return {
    bg: dark ? '#0E1720' : '#F3F8FA',
    card: dark ? '#1A2935' : '#FFFFFF',
    cardAlt: dark ? '#213441' : '#F3FAF7',
    text: dark ? '#F4FAFF' : '#122234',
    muted: dark ? '#A6B6C6' : '#718094',
    border: dark ? '#2F4250' : '#E5EDF2',
    primary: '#12C873',
  };
}

export const softShadow = {
  shadowColor: '#1A5462',
  shadowOffset: { width: 0, height: 5 },
  shadowOpacity: 0.08,
  shadowRadius: 14,
  elevation: 3,
} as const;

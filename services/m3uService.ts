

import { Channel, ChannelGroup, Category, StreamVariant } from '../types';

// Helper to generate UUIDs safely on all platforms
const generateUUID = (): string => {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    try {
        return crypto.randomUUID();
    } catch (e) {
        // Fallback
    }
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
    const r = Math.random() * 16 | 0, v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
};

const generateFallbackLogo = (name: string): string => {
  const cleanName = name
    .replace(/(HD|FHD|4K|UHD|HEVC|RAW)/gi, '')
    .replace(/^([A-Z]{2,3}\s*[-|]\s*)/, '')
    .trim();
  
  return `https://ui-avatars.com/api/?name=${encodeURIComponent(cleanName)}&background=1f2937&color=fff&size=200&font-size=0.4&bold=true&length=2`;
};

const extractAttribute = (line: string, key: string): string | null => {
  const regex = new RegExp(`${key}=("([^"]*)"|'([^']*)'|([^\\s,]*))`, 'i');
  const match = line.match(regex);
  if (!match) return null;
  return (match[2] || match[3] || match[4] || '').trim();
};

// Helper to parse Name and Quality based on requirements
const parseChannelInfo = (rawName: string): { baseName: string; quality: string } => {
    // 1. Unicode Normalization: Converts characters like ᴴᴰ to HD, ⁺ to +, etc.
    const normalizedName = rawName.normalize('NFKC');

    // Extended words to strip (Quality/Region/Variants)
    // Includes: Xtra, Xstra, Regions (SE, NO, DK, FI), Tech specs
    const stripRegex = /\b(4k|8k|uhd|lq|hd|fhd|hq|sd|hevc|h265|h264|avc|1080p|720p|50fps|60fps|vip|premium|backup|xtra|xstra|extra|exstra|se|swe|sweden|no|nor|norway|dk|dan|denmark|fi|fin|finland|en|english|ar|arab|arabic|tr|turkey|france|fr|french|ultra|italy|it|italian|guhd|afc|raw|720|480|hr|rs|eu|europe|scandinavia|nordic|int)\b/gi;
    
    // Find matches to determine quality/variant label
    const matches = normalizedName.match(stripRegex);
    
    // Default quality
    let quality = 'SD';
    
    if (matches && matches.length > 0) {
        // Use the last match as the primary quality indicator (e.g., "Sky Sport FHD" -> FHD)
        // Or "V Sport Xtra" -> XTRA
        quality = matches[matches.length - 1].toUpperCase();
    }

    // Remove the tags to get the base name
    let baseName = normalizedName.replace(stripRegex, '');

    // Cleanup artifacts:
    // 1. Remove wrapping characters like (), [], |
    // 2. Remove leading non-word characters often left from prefixes (e.g. " - Channel")
    // 3. Collapse multiple spaces
    baseName = baseName
        .replace(/[()\[\]|]/g, '')     // Remove brackets/pipes
        .replace(/^[\s\W]+/, '')       // Remove leading separators (-, :, space)
        .replace(/\s+/g, ' ')          // Collapse spaces
        .trim();

    // Fallback if we stripped everything
    if (!baseName) baseName = rawName.trim();

    return { baseName, quality };
};

export const parseM3U = (content: string, category?: string): { groups: ChannelGroup[], epgUrl: string | null } => {
  const lines = content.split('\n');
  const groups: Record<string, Channel[]> = {};
  let epgUrl: string | null = null;
  
  // Map to track unique channels based on Base Name.
  // KEY = baseName.toLowerCase()
  // This ensures a channel only appears ONCE per playlist load, regardless of Group.
  const globalChannelMap = new Map<string, Channel>();

  let currentChannel: Partial<Channel> = {};
  let globalChannelIndex = 0; // 1-based index tracker

  for (let i = 0; i < Math.min(lines.length, 5); i++) {
     const line = lines[i].trim();
     if (line.startsWith('#EXTM3U')) {
        epgUrl = extractAttribute(line, 'url-tvg') || extractAttribute(line, 'x-tvg-url');
        if (epgUrl) break;
     }
  }

  lines.forEach((line) => {
    const trimmedLine = line.trim();
    if (!trimmedLine) return;

    if (trimmedLine.startsWith('#EXTINF:')) {
      const lastCommaIndex = trimmedLine.lastIndexOf(',');
      let rawName = '';
      if (lastCommaIndex !== -1) {
        rawName = trimmedLine.substring(lastCommaIndex + 1).trim();
      }

      const groupTitle = extractAttribute(trimmedLine, 'group-title') || 'Uncategorized';
      const tvgLogo = extractAttribute(trimmedLine, 'tvg-logo') || extractAttribute(trimmedLine, 'logo');
      const tvgName = extractAttribute(trimmedLine, 'tvg-name');
      const tvgId = extractAttribute(trimmedLine, 'tvg-id');

      if (!rawName && tvgName) rawName = tvgName;
      if (!rawName) rawName = 'Unknown Channel';

      currentChannel = {
        name: rawName, // Temporary, will be parsed later
        group: groupTitle,
        logo: tvgLogo || undefined,
        tvgId: tvgId || undefined
      };
    } else if (!trimmedLine.startsWith('#')) {
      if (currentChannel.name) {
        globalChannelIndex++; // Increment for every found stream
        
        const url = trimmedLine;
        const rawName = currentChannel.name;
        const groupName = currentChannel.group || 'Uncategorized';
        const logo = currentChannel.logo || generateFallbackLogo(rawName);
        const tvgId = currentChannel.tvgId;

        const { baseName, quality } = parseChannelInfo(rawName);

        // --- GROUPING LOGIC ---
        let shouldGroup = false;

        if (category === Category.FOTBOLL) {
            // Fotboll: Always group by base name
            shouldGroup = true;
        } else if (category === Category.KANALER) {
            // Kanaler: Only group if index is between 115 and 248 (Inclusive)
            if (globalChannelIndex >= 115 && globalChannelIndex <= 248) {
                shouldGroup = true;
            }
        }

        const mapKey = baseName.toLowerCase();

        // Check if we should merge into an existing channel
        if (shouldGroup && globalChannelMap.has(mapKey)) {
            // MERGE into existing channel
            // Note: This merges it into the group where the channel was FIRST seen.
            // It will NOT create a duplicate entry in the current `groupName`.
            const existingChannel = globalChannelMap.get(mapKey)!;
            
            // Add to streams if not already present
            if (!existingChannel.streams) {
                existingChannel.streams = [];
                existingChannel.streams.push({ 
                    quality: 'Default', 
                    url: existingChannel.url 
                });
            }

            existingChannel.streams.push({
                quality: quality,
                url: url
            });

        } else {
            // CREATE NEW channel
            const newChannel: Channel = {
                id: generateUUID(),
                name: shouldGroup ? baseName : rawName, // Use cleaned name if grouped, else raw
                group: groupName,
                logo: logo,
                url: url,
                tvgId: tvgId,
                streams: []
            };

            // Initialize streams array with the first found stream
            newChannel.streams = [{ quality: shouldGroup ? quality : 'Default', url: url }];

            if (!groups[groupName]) {
                groups[groupName] = [];
            }
            groups[groupName].push(newChannel);
            
            // Only register in map if we are allowed to group this channel
            if (shouldGroup) {
                globalChannelMap.set(mapKey, newChannel);
            }
        }

        currentChannel = {}; // Reset
      }
    }
  });

  const sortedGroups = Object.keys(groups)
    .sort()
    .map(title => ({
      title,
      channels: groups[title]
    }));

  return { groups: sortedGroups, epgUrl };
};

export const fetchPlaylist = async (url: string, category?: string): Promise<{ groups: ChannelGroup[], epgUrl: string | null }> => {
  if (!url) return { groups: [], epgUrl: null };
  try {
    const response = await fetch(url);
    if (!response.ok) throw new Error('Network response was not ok');
    const text = await response.text();
    return parseM3U(text, category);
  } catch (error) {
    console.error("Failed to fetch playlist:", error);
    return { groups: [], epgUrl: null };
  }
};

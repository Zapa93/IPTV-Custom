import React, { useEffect, useRef, useState, useCallback, useLayoutEffect } from 'react';
import { Channel, EPGData, EPGProgram, ChannelGroup, Category } from '../types';
import { DEFAULT_LOGO } from '../constants';
import { getCurrentProgram, getNextProgram } from '../services/epgService';
import { PlayerChannelItem, PlayerGroupItem } from './ListItems';
import { TeletextViewer } from './TeletextViewer';

interface VideoPlayerProps {
  channel: Channel;
  activeCategory: Category;
  allChannels: Channel[];
  globalChannels: Channel[];
  playlist: ChannelGroup[];
  epgData: EPGData;
  onClose: () => void;
  onChannelSelect: (channel: Channel) => void;
}

declare global {
  interface Window { Hls: any; }
}

export const VideoPlayer: React.FC<VideoPlayerProps> = ({ channel, activeCategory, allChannels, globalChannels, playlist, epgData, onClose, onChannelSelect }) => {
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const listContainerRef = useRef<HTMLDivElement>(null);
  
  // STATES
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [isListOpen, setIsListOpen] = useState(false);
  const [showTeletext, setShowTeletext] = useState(false);
  const [resolution, setResolution] = useState<string | null>(null);
  
  const [activeStreamIndex, setActiveStreamIndex] = useState(0);
  const [streamSwitchToast, setStreamSwitchToast] = useState<string | null>(null);
  
  const [scrollTop, setScrollTop] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [prevChannelId, setPrevChannelId] = useState<string | null>(null);

  const [currentProgram, setCurrentProgram] = useState<EPGProgram | null>(null);
  const [nextProgram, setNextProgram] = useState<EPGProgram | null>(null);
  const [progress, setProgress] = useState(0);

  const [viewMode, setViewMode] = useState<'channels' | 'groups'>('channels');
  const [focusArea, setFocusArea] = useState<'list' | 'sidebar'>('list');
  
  const [currentChannelList, setCurrentChannelList] = useState<Channel[]>(allChannels);
  const [currentGroup, setCurrentGroup] = useState<ChannelGroup | null>(() => {
      return playlist.find(g => g.title === channel.group) || null;
  });

  const controlsTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const streamToastTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const hlsRef = useRef<any>(null);
  
  const isListOpenRef = useRef(isListOpen);
  const channelRef = useRef(channel);
  const currentChannelListRef = useRef(currentChannelList);
  const playlistRef = useRef(playlist);
  
  useEffect(() => { isListOpenRef.current = isListOpen; }, [isListOpen]);
  useEffect(() => { channelRef.current = channel; }, [channel]);
  useEffect(() => { currentChannelListRef.current = currentChannelList; }, [currentChannelList]);
  useEffect(() => { playlistRef.current = playlist; }, [playlist]);

  const ITEM_HEIGHT = 65; 
  const LIST_HEIGHT = 900; 
  const RENDER_BUFFER = 10;

  // --- SYNC CHANNEL ---
  if (channel.id !== prevChannelId) {
     const idx = currentChannelList.findIndex(c => c.id === channel.id);
     if (idx !== -1) {
        setSelectedIndex(idx);
        setPrevChannelId(channel.id);
     } else {
        const group = playlist.find(g => g.title === channel.group);
        if (group) {
            setCurrentGroup(group);
            setCurrentChannelList(group.channels);
            const newIdx = group.channels.findIndex(c => c.id === channel.id);
            if (newIdx !== -1) setSelectedIndex(newIdx);
        }
        setPrevChannelId(channel.id);
     }
     setActiveStreamIndex(0);
     setIsListOpen(false);
  }

  // --- TIMER ---
  const resetTimer = useCallback(() => {
      setShowControls(true);
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      controlsTimeoutRef.current = setTimeout(() => {
          if (!isListOpenRef.current) setShowControls(false);
      }, 5000);
  }, []);

  useEffect(() => {
      resetTimer();
      const handleActivity = () => resetTimer();
      window.addEventListener('mousemove', handleActivity);
      window.addEventListener('keydown', handleActivity);
      return () => {
          window.removeEventListener('mousemove', handleActivity);
          window.removeEventListener('keydown', handleActivity);
          if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
      };
  }, [resetTimer]);

  // --- EPG UPDATE ---
  useEffect(() => {
     const updateEPG = () => {
        // Hämta EPG för den kanal vi tittar på just nu
        if (channel.tvgId && epgData[channel.tvgId]) {
           const prog = getCurrentProgram(epgData[channel.tvgId]);
           const next = getNextProgram(epgData[channel.tvgId]);
           setCurrentProgram(prog);
           setNextProgram(next);
           if (prog) {
               const total = prog.end.getTime() - prog.start.getTime();
               const elapsed = new Date().getTime() - prog.start.getTime();
               setProgress(Math.min(100, Math.max(0, (elapsed / total) * 100)));
           } else { setProgress(0); }
        } else {
            setCurrentProgram(null); setNextProgram(null); setProgress(0);
        }
     };
     
     updateEPG(); // Kör direkt
     const interval = setInterval(updateEPG, 30000); // Uppdatera var 30e sekund
     return () => clearInterval(interval);
  }, [channel, epgData]); // Körs om kanal eller EPG-data ändras

  // --- VIDEO LOGIC ---
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) { hlsRef.current.destroy(); hlsRef.current = null; }
    if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
    
    setIsLoading(true);
    setResolution(null);

    const loadStream = () => {
        setIsLoading(true);
        let url = channel.url;
        if (channel.streams && channel.streams.length > 0 && channel.streams[activeStreamIndex]) {
            url = channel.streams[activeStreamIndex].url;
        }

        if (video.canPlayType('application/vnd.apple.mpegurl')) {
          video.src = url;
          video.load();
        } else if (window.Hls && window.Hls.isSupported()) {
          const hls = new window.Hls({ enableWorker: true, lowLatencyMode: true });
          hlsRef.current = hls;
          hls.loadSource(url);
          hls.attachMedia(video);
          hls.on(window.Hls.Events.MANIFEST_PARSED, () => { setIsLoading(false); video.play().catch(() => {}); });
          hls.on(window.Hls.Events.ERROR, (_event: any, data: any) => {
            if (data.fatal) { hls.destroy(); retryTimeoutRef.current = setTimeout(loadStream, 3000); }
          });
        } else {
           video.src = url;
        }
    };

    const handleReady = () => { setIsLoading(false); if (video.paused) video.play().catch(() => {}); };
    const handleError = () => { retryTimeoutRef.current = setTimeout(loadStream, 3000); };

    video.addEventListener('canplay', handleReady);
    video.addEventListener('error', handleError);
    
    loadStream();

    return () => {
      if (hlsRef.current) hlsRef.current.destroy();
      if (retryTimeoutRef.current) clearTimeout(retryTimeoutRef.current);
      video.removeEventListener('canplay', handleReady);
      video.removeEventListener('error', handleError);
      video.removeAttribute('src'); 
      video.load();
    };
  }, [channel, activeStreamIndex]); 

  // --- INPUT / NAVIGATION ---
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      resetTimer(); 

      if (e.key === 'b' || e.key === 'Blue') {
          e.preventDefault(); setShowTeletext(p => !p); return;
      }
      if (showTeletext) return;

      const isEnter = e.key === 'Enter';
      const isBack = e.key === 'Back' || e.key === 'Escape' || e.keyCode === 461;
      const isUp = e.key === 'ArrowUp' || e.key === 'PageUp' || e.key === 'ChannelUp';
      const isDown = e.key === 'ArrowDown' || e.key === 'PageDown' || e.key === 'ChannelDown';
      const isLeft = e.key === 'ArrowLeft';
      const isRight = e.key === 'ArrowRight';

      if (isBack) {
          e.preventDefault();
          if (isListOpenRef.current) {
              if (viewMode === 'groups') {
                  setViewMode('channels'); setFocusArea('list');
              } else {
                  setIsListOpen(false);
              }
          } else {
              onClose();
          }
          return;
      }

      if (!isListOpenRef.current) {
          const list = currentChannelListRef.current;
          const currId = channelRef.current.id;
          const idx = list.findIndex(c => c.id === currId);
          
          if (isUp) {
              const next = Math.min(list.length - 1, idx + 1);
              if (next !== idx) onChannelSelect(list[next]);
          } else if (isDown) {
              const prev = Math.max(0, idx - 1);
              if (prev !== idx) onChannelSelect(list[prev]);
          } else if (isEnter || isRight) {
              setSelectedIndex(idx !== -1 ? idx : 0);
              setViewMode('channels');
              setFocusArea('list');
              setIsListOpen(true);
              // Auto-center scroll
              setTimeout(() => {
                  if (listContainerRef.current) {
                      const top = Math.max(0, idx * ITEM_HEIGHT - LIST_HEIGHT / 2 + ITEM_HEIGHT / 2);
                      listContainerRef.current.scrollTop = top;
                      setScrollTop(top);
                  }
              }, 10);
          }
          return;
      }

      // LIST NAVIGATION
      if (isListOpenRef.current) {
          const listLen = viewMode === 'channels' ? currentChannelListRef.current.length : playlistRef.current.length;
          
          if (isUp) {
              setSelectedIndex(prev => {
                  const n = Math.max(0, prev - 1);
                  // Scroll logic: Keep selected item visible
                  if (listContainerRef.current) {
                      const itemTop = n * ITEM_HEIGHT;
                      if (itemTop < listContainerRef.current.scrollTop) {
                          listContainerRef.current.scrollTop = itemTop;
                      }
                  }
                  return n;
              });
          } else if (isDown) {
              setSelectedIndex(prev => {
                  const n = Math.min(listLen - 1, prev + 1);
                  // Scroll logic: Keep selected item visible at bottom
                  if (listContainerRef.current) {
                      const itemBottom = (n + 1) * ITEM_HEIGHT;
                      if (itemBottom > listContainerRef.current.scrollTop + LIST_HEIGHT) {
                          listContainerRef.current.scrollTop = itemBottom - LIST_HEIGHT;
                      }
                  }
                  return n;
              });
          } else if (isLeft) {
              if (focusArea === 'list') { setFocusArea('sidebar'); setSelectedIndex(0); }
          } else if (isRight) {
              if (focusArea === 'sidebar') { setFocusArea('list'); setSelectedIndex(0); }
          } else if (isEnter) {
              if (focusArea === 'sidebar') {
                  if (selectedIndex === 0 && viewMode === 'channels') {
                      setViewMode('groups'); setFocusArea('list'); setSelectedIndex(0); setScrollTop(0);
                  } else {
                      onClose();
                  }
              } else {
                  if (viewMode === 'groups') {
                      const group = playlistRef.current[selectedIndex];
                      setCurrentGroup(group);
                      setCurrentChannelList(group.channels);
                      setViewMode('channels'); setSelectedIndex(0); setScrollTop(0);
                      if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
                  } else {
                      const ch = currentChannelListRef.current[selectedIndex];
                      if (ch.id !== channelRef.current.id) onChannelSelect(ch);
                      else setIsListOpen(false);
                  }
              }
          }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onChannelSelect, onClose, showTeletext, viewMode, focusArea, selectedIndex]);

  // --- RENDER LIST ---
  const renderList = () => {
      if (!isListOpen) return null;
      
      const list = viewMode === 'channels' ? currentChannelList : playlist;
      const totalHeight = list.length * ITEM_HEIGHT;
      const start = Math.floor(scrollTop / ITEM_HEIGHT);
      const end = Math.min(list.length, start + Math.ceil(LIST_HEIGHT / ITEM_HEIGHT) + RENDER_BUFFER);
      const visible = list.slice(Math.max(0, start - 2), end); // Lite buffert uppåt
      const paddingTop = Math.max(0, start - 2) * ITEM_HEIGHT;

      return (
          <div 
            ref={listContainerRef}
            className="flex-1 overflow-y-auto no-scrollbar relative"
            onScroll={e => setScrollTop(e.currentTarget.scrollTop)}
            onClick={e => e.stopPropagation()}
          >
              <div style={{ height: totalHeight, paddingTop }}>
                  {visible.map((item, i) => {
                      const index = Math.max(0, start - 2) + i;
                      const isSel = index === selectedIndex && focusArea === 'list';
                      
                      if (viewMode === 'groups') {
                          const g = item as ChannelGroup;
                          return (
                              <PlayerGroupItem 
                                key={g.title} group={g} index={index} itemHeight={ITEM_HEIGHT} isSelected={isSel}
                                onClick={() => {
                                    setCurrentGroup(g); setCurrentChannelList(g.channels);
                                    setViewMode('channels'); setSelectedIndex(0); setScrollTop(0);
                                    if (listContainerRef.current) listContainerRef.current.scrollTop = 0;
                                }}
                                onMouseEnter={() => { setSelectedIndex(index); if (focusArea==='sidebar') setFocusArea('list'); }}
                              />
                          );
                      } else {
                          const c = item as Channel;
                          // Hämta EPG för VARJE kanal i listan
                          const prog = c.tvgId ? getCurrentProgram(epgData[c.tvgId]) : null;
                          // Beräkna progress för list-objektet
                          let itemProgress = 0;
                          if (prog) {
                              const t = prog.end.getTime() - prog.start.getTime();
                              const e = new Date().getTime() - prog.start.getTime();
                              itemProgress = Math.min(100, Math.max(0, (e / t) * 100));
                          }

                          return (
                              <PlayerChannelItem 
                                key={c.id} channel={c} index={index} itemHeight={ITEM_HEIGHT} isSelected={isSel}
                                isActiveChannel={c.id === channel.id}
                                currentProg={prog} // Skicka med programinfo här!
                                progress={itemProgress} // Skicka med progressbar
                                onClick={() => { if (c.id !== channel.id) onChannelSelect(c); else setIsListOpen(false); }}
                                onMouseEnter={() => { setSelectedIndex(index); if (focusArea==='sidebar') setFocusArea('list'); }}
                              />
                          );
                      }
                  })}
              </div>
          </div>
      );
  };

  return (
    <div className="fixed inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
      
      {/* VIDEO */}
      <video 
        ref={videoRef} 
        className="absolute inset-0 w-full h-full object-contain bg-black z-0 cursor-pointer" 
        autoPlay playsInline 
        onClick={() => { if (!isListOpen) { setIsListOpen(true); setShowControls(false); } }}
      />

      {/* TELETEXT */}
      {showTeletext && <TeletextViewer onClose={() => setShowTeletext(false)} />}

      {/* BUFFERING */}
      {isLoading && !showTeletext && (
        <div className="absolute inset-0 flex items-center justify-center z-10 pointer-events-none">
           <div className="bg-black/60 p-6 rounded-xl border border-white/20">
               <p className="text-white font-bold animate-pulse">LOADING...</p>
           </div>
        </div>
      )}

      {/* LIST MODAL */}
      {isListOpen && !showTeletext && (
          <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50" onClick={() => setIsListOpen(false)}>
              <div className="flex gap-4 h-[900px]" onClick={e => e.stopPropagation()}>
                  {/* SIDEBAR */}
                  <div className={`w-[160px] bg-[#111] rounded-xl border border-white/10 p-2 flex flex-col gap-2 ${focusArea === 'sidebar' ? 'border-white' : ''}`}>
                      {viewMode === 'channels' && playlist.length > 1 && (
                          <div className={`p-4 rounded text-center cursor-pointer ${focusArea==='sidebar' && selectedIndex===0 ? 'bg-purple-600 text-white' : 'bg-white/10 text-gray-300'}`}
                               onMouseEnter={() => { setFocusArea('sidebar'); setSelectedIndex(0); }}
                               onClick={() => { setViewMode('groups'); setFocusArea('list'); setSelectedIndex(0); }}>
                              Change Group
                          </div>
                      )}
                      <div className={`p-4 rounded text-center cursor-pointer ${focusArea==='sidebar' && ((viewMode==='channels' && playlist.length>1 && selectedIndex===1) || ((viewMode!=='channels' || playlist.length<=1) && selectedIndex===0)) ? 'bg-red-600 text-white' : 'bg-white/10 text-gray-300'}`}
                           onMouseEnter={() => { setFocusArea('sidebar'); setSelectedIndex(viewMode === 'channels' && playlist.length > 1 ? 1 : 0); }}
                           onClick={onClose}>
                          Exit
                      </div>
                  </div>

                  {/* LIST */}
                  <div className="w-[950px] bg-[#151515] rounded-xl border border-white/10 flex flex-col overflow-hidden">
                      {renderList()}
                  </div>
              </div>
          </div>
      )}

      {/* CONTROLS OVERLAY (Nu med EPG!) */}
      {showControls && !isListOpen && !showTeletext && (
        <div className="absolute inset-0 pointer-events-none z-50 flex flex-col justify-end p-12 bg-gradient-to-t from-black/90 to-transparent">
            <div className="flex items-end gap-6">
                <div className="w-28 h-28 bg-white/10 rounded-xl p-2 flex items-center justify-center border border-white/20">
                    <img src={channel.logo} className="max-w-full max-h-full" onError={e => (e.target as HTMLImageElement).src = DEFAULT_LOGO} />
                </div>
                <div className="flex-1">
                    <h1 className="text-5xl font-bold text-white mb-3 shadow-lg">{channel.name}</h1>
                    
                    {/* EPG INFORMATION PÅ INFOBAREN */}
                    {currentProgram ? (
                        <div className="animate-fade-in-up">
                            <div className="flex items-center gap-3 mb-2">
                                <span className="bg-red-600 text-white text-xs font-bold px-2 py-1 rounded uppercase">Live</span>
                                <div className="text-3xl text-gray-100 font-medium truncate">{currentProgram.title}</div>
                            </div>
                            <div className="flex items-center gap-3 text-lg text-gray-400 mb-2">
                                <span>{currentProgram.start.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})} - {currentProgram.end.toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'})}</span>
                                {nextProgram && (
                                    <span className="text-gray-500 pl-3 border-l border-gray-600">Next: {nextProgram.title}</span>
                                )}
                            </div>
                            {/* Progress Bar */}
                            <div className="w-1/2 h-1.5 bg-gray-700 rounded-full overflow-hidden mt-1">
                                <div className="h-full bg-purple-500" style={{ width: `${progress}%` }}></div>
                            </div>
                            {currentProgram.description && (
                                <p className="text-gray-400 text-sm mt-2 line-clamp-1 opacity-80">{currentProgram.description}</p>
                            )}
                        </div>
                    ) : (
                        <div className="text-gray-400 text-xl">No Program Information</div>
                    )}
                </div>
            </div>
        </div>
      )}

    </div>
  );
};
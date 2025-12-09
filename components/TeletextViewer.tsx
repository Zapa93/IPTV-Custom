
import React, { useEffect, useState, useRef, useCallback } from 'react';

interface TeletextViewerProps {
  onClose: () => void;
}

export const TeletextViewer: React.FC<TeletextViewerProps> = ({ onClose }) => {
  const [page, setPage] = useState<string>("100");
  const [htmlContent, setHtmlContent] = useState<string>("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const [inputBuffer, setInputBuffer] = useState<string>("");

  const pageRef = useRef(page);
  const bufferRef = useRef(inputBuffer);
  
  // Sync refs for event listener
  useEffect(() => { pageRef.current = page; }, [page]);
  useEffect(() => { bufferRef.current = inputBuffer; }, [inputBuffer]);

  const fetchPage = useCallback(async (pageNum: string) => {
    setLoading(true);
    setError(false);
    
    const targetUrl = `https://www.svt.se/text-tv/api/${pageNum}`;

    try {
      // 1. Try Direct Fetch (Works if CORS is disabled on TV)
      const res = await fetch(targetUrl, {
          credentials: 'omit',
          cache: 'no-store'
      });
      
      if (!res.ok) throw new Error("Direct Fetch Failed");
      
      const data = await res.json();
      if (data && data.content && data.content[0]) {
          setHtmlContent(data.content[0].html);
      } else {
          throw new Error("Invalid Data");
      }

    } catch (directErr) {
      console.warn("Direct SVT fetch failed, attempting proxy...", directErr);
      
      try {
        // 2. Fallback to CORS Proxy (Works on PC/Strict Browsers)
        const proxyUrl = `https://api.allorigins.win/raw?url=${encodeURIComponent(targetUrl)}`;
        const proxyRes = await fetch(proxyUrl);
        
        if (!proxyRes.ok) throw new Error("Proxy Fetch Failed");
        
        const data = await proxyRes.json();
        if (data && data.content && data.content[0]) {
            setHtmlContent(data.content[0].html);
        } else {
            throw new Error("Invalid Data from Proxy");
        }
      } catch (proxyErr) {
        console.error("Teletext Proxy Error:", proxyErr);
        setError(true);
        setHtmlContent("");
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPage(page);
  }, [page, fetchPage]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
        const isNav = ['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter', 'Backspace', 'Escape'].includes(e.key);
        if (isNav) {
            e.preventDefault();
            e.stopPropagation();
        }

        const key = e.key;
        const currentBuffer = bufferRef.current;

        // --- CLOSING ---
        if (key === 'Escape' || key === 'Backspace' || e.keyCode === 461) {
            onClose();
            return;
        }

        // --- NAVIGATION ---
        if (key === 'ArrowRight') {
            const next = parseInt(pageRef.current) + 1;
            setPage(next.toString());
            return;
        }
        if (key === 'ArrowLeft') {
            const prev = parseInt(pageRef.current) - 1;
            if (prev >= 100) setPage(prev.toString());
            return;
        }

        // --- NUMERIC INPUT ---
        if (/^[0-9]$/.test(key)) {
            const newBuffer = currentBuffer + key;
            if (newBuffer.length === 3) {
                setPage(newBuffer);
                setInputBuffer("");
            } else {
                setInputBuffer(newBuffer);
            }
        }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fallback Error Page Content (Simulated Teletext)
  const errorHtml = `
    <pre class="root"><span class="bgB W"> ${page} SVT Text </span><br/><br/><br/><span class="Y">     SIDAN SAKNAS / KAN EJ LADDAS</span><br/><br/><span class="W">     Kunde ej hämta sidan ${page}.</span><br/><span class="W">     Kontrollera nätverk eller prova igen.</span><br/><br/><br/><span class="G">     Gå till startsidan 100...</span></pre>
  `;

  // Loading Page Content
  const loadingHtml = `
    <pre class="root"><span class="bgB W"> ${page} SVT Text </span><br/><br/><br/><span class="G">     SÖKER...</span></pre>
  `;

  return (
    <div className="absolute inset-0 z-50 bg-black flex items-center justify-center overflow-hidden">
        
        {/* INPUT OVERLAY (Retro Style) */}
        {inputBuffer && (
            <div className="absolute top-[10%] left-[10%] z-50 bg-black border-2 border-white px-4 py-2">
                <span className="font-mono text-yellow-400 text-4xl font-bold tracking-widest">
                    P{inputBuffer}{"_".repeat(3 - inputBuffer.length)}
                </span>
            </div>
        )}

        {/* TELETEXT RENDERER */}
        {/* We scale it up significantly because raw teletext HTML is tiny */}
        <div className="teletext-container transform scale-[2.2] sm:scale-[1.5] md:scale-[2.5] origin-center">
             <div dangerouslySetInnerHTML={{ __html: loading ? loadingHtml : error ? errorHtml : htmlContent }} />
        </div>

        {/* CSS MAPPING FOR SVT CLASSNAMES */}
        <style>{`
            .teletext-container {
                font-family: 'Courier New', Courier, monospace;
                font-weight: bold;
                background-color: black;
                color: white;
                line-height: 1.25; /* Match typical teletext line height */
                image-rendering: pixelated; /* Keep it blocky */
            }
            
            .teletext-container pre {
                margin: 0;
                white-space: pre;
                background-color: black;
            }

            .teletext-container span { display: inline; }
            .teletext-container a { text-decoration: none; color: inherit; }

            /* SVT API Colors */
            .W { color: #ffffff; }
            .Y { color: #ffff00; }
            .C { color: #00ffff; }
            .G { color: #00ff00; }
            .M { color: #ff00ff; }
            .R { color: #ff0000; }
            .B { color: #0000ff; }
            .Bl { color: #000000; }
            
            .bgW { background-color: #ffffff; }
            .bgY { background-color: #ffff00; }
            .bgC { background-color: #00ffff; }
            .bgG { background-color: #00ff00; }
            .bgM { background-color: #ff00ff; }
            .bgR { background-color: #ff0000; }
            .bgB { background-color: #0000ff; }
            .bgBl { background-color: #000000; }
        `}</style>
    </div>
  );
};

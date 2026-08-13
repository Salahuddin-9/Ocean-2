import sys

with open('src/App.tsx', 'r') as f:
    content = f.read()

target = """          return (
            <div className="fixed inset-0 z-50 flex flex-col justify-between p-4 md:p-8 bg-[#0a0805]/98 backdrop-blur-xl select-none text-white">"""

replacement = """          return (
            <div 
              className="fixed inset-0 z-50 flex flex-col justify-between p-4 md:p-8 bg-[#0a0805]/98 backdrop-blur-xl select-none text-white"
              onTouchStart={(e) => {
                setTouchStartY(e.targetTouches[0].clientY);
                setTouchEndY(null);
              }}
              onTouchMove={(e) => {
                setTouchEndY(e.targetTouches[0].clientY);
              }}
              onTouchEnd={() => {
                if (touchStartY === null || touchEndY === null) return;
                const distance = touchStartY - touchEndY;
                const minSwipeDistance = 40;
                if (distance > minSwipeDistance) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev < slides.length - 1 ? prev + 1 : 0;
                  });
                } else if (distance < -minSwipeDistance) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev > 0 ? prev - 1 : slides.length - 1;
                  });
                }
                setTouchStartY(null);
                setTouchEndY(null);
              }}
              onWheel={(e) => {
                if (Math.abs(e.deltaY) < 30) return;
                const now = Date.now();
                if ((window as any)._lastMediaWheel && now - (window as any)._lastMediaWheel < 600) {
                  return;
                }
                (window as any)._lastMediaWheel = now;
                if (e.deltaY > 0) {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev < slides.length - 1 ? prev + 1 : 0;
                  });
                } else {
                  setActiveImmersiveMediaIndex(prev => {
                    if (prev === null) return null;
                    return prev > 0 ? prev - 1 : slides.length - 1;
                  });
                }
              }}
            >"""

content = content.replace(target, replacement)

# Now remove the bottom controls
bottom_controls = """              {/* Bottom Controls / Slide Navigation */}
              <div className="flex items-center justify-between border-t border-white/10 pt-4 z-10">
                <div className="hidden md:flex items-center gap-1 text-[10px] font-mono text-[#ebdcca]/50 uppercase">
                  <span>Use</span>
                  <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white text-[9px]">↑</kbd>
                  <kbd className="bg-white/10 px-1.5 py-0.5 rounded text-white text-[9px]">↓</kbd>
                  <span>keys to dive</span>
                </div>

                <div className="flex items-center gap-2 mx-auto md:mx-0">
                  <button
                    onClick={() => activeImmersiveMediaIndex > 0 && setActiveImmersiveMediaIndex(activeImmersiveMediaIndex - 1)}
                    disabled={activeImmersiveMediaIndex === 0}
                    className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-2xl transition-all shadow-md flex items-center gap-1.5 text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    <ChevronUp size={16} /> Prev
                  </button>
                  <button
                    onClick={() => activeImmersiveMediaIndex < slides.length - 1 && setActiveImmersiveMediaIndex(activeImmersiveMediaIndex + 1)}
                    disabled={activeImmersiveMediaIndex === slides.length - 1}
                    className="p-3 bg-white/10 hover:bg-white/20 disabled:opacity-30 text-white rounded-2xl transition-all shadow-md flex items-center gap-1.5 text-xs font-mono font-bold uppercase cursor-pointer"
                  >
                    Next <ChevronDown size={16} />
                  </button>
                </div>
              </div>"""

content = content.replace(bottom_controls, "")

with open('src/App.tsx', 'w') as f:
    f.write(content)

print("Done")

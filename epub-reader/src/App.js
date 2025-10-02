
import React, { useRef, useState, useEffect } from 'react';
import ePub from 'epubjs';
import './App.css';


function App() {
  const viewerRef = useRef(null);
  const [book, setBook] = useState(null);
  const [rendition, setRendition] = useState(null);
  const [currentLocation, setCurrentLocation] = useState(null);
  const [totalPages, setTotalPages] = useState(0);
  const [page, setPage] = useState(1);
  const [error, setError] = useState("");
  const [zoom, setZoom] = useState(1);
  const [thumbnails, setThumbnails] = useState({}); // { pageNum: dataUrl }
  const [showThumbnails, setShowThumbnails] = useState(false);
  const [thumbScroll, setThumbScroll] = useState(0);



  // Generate a thumbnail for a given page number (1-based)
  const generateThumbnail = async (pageNum) => {
    if (!book || !book.locations) return;
    if (thumbnails[pageNum]) return; // Already generated
    const cfi = book.locations.cfiFromLocation(pageNum);
    // Create a hidden container
    const container = document.createElement('div');
    container.style.width = '200px';
    container.style.height = '250px';
    container.style.overflow = 'hidden';
    container.style.position = 'fixed';
    container.style.left = '-9999px';
    document.body.appendChild(container);
    const thumbRendition = book.renderTo(container, {
      width: 200,
      height: 250,
      flow: 'paginated',
      allowScriptedContent: false,
    });
    await thumbRendition.display(cfi);
    // Wait a bit for rendering
    await new Promise(res => setTimeout(res, 100));
    const iframe = container.querySelector('iframe');
    let dataUrl = '';
    if (iframe) {
      const iframeDoc = iframe.contentDocument || iframe.contentWindow.document;
      const svg = iframeDoc.querySelector('svg');
      if (svg) {
        // If SVG, render to canvas
        const xml = new XMLSerializer().serializeToString(svg);
        const img = new window.Image();
        img.src = 'data:image/svg+xml;base64,' + window.btoa(xml);
        await new Promise(res => { img.onload = res; });
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 250;
        const ctx = canvas.getContext('2d');
        ctx.drawImage(img, 0, 0, 200, 250);
        dataUrl = canvas.toDataURL('image/png');
      } else {
        // Otherwise, rasterize the iframe
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 250;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#fff';
        ctx.fillRect(0, 0, 200, 250);
        try {
          ctx.drawWindow && ctx.drawWindow(iframe.contentWindow, 0, 0, 200, 250, '#fff');
        } catch {}
        dataUrl = canvas.toDataURL('image/png');
      }
    }
    thumbRendition.destroy();
    document.body.removeChild(container);
    setThumbnails(prev => ({ ...prev, [pageNum]: dataUrl }));
  };

  // Lazy load thumbnails for visible pages
  useEffect(() => {
    if (!showThumbnails || !totalPages) return;
    const thumbsPerView = 10;
    const start = Math.max(1, Math.floor(thumbScroll / 210) + 1);
    const end = Math.min(totalPages, start + thumbsPerView - 1);
    for (let i = start; i <= end; i++) {
      generateThumbnail(i);
    }
    // eslint-disable-next-line
  }, [showThumbnails, totalPages, thumbScroll, book]);

  // Handle thumbnail scroll
// ...existing code...

  const handleZoomIn = () => {
    setZoom((z) => Math.min(z + 0.1, 2));
    if (rendition) {
      rendition.resize(window.innerWidth * (zoom + 0.1), window.innerHeight * (zoom + 0.1));
    }
  };

  // Clear the viewer div
  const clearViewer = () => {
    if (viewerRef.current) {
      viewerRef.current.innerHTML = '';
    }
  };

  // Go to a specific page
  const goToPage = (pageNum) => {
    if (!book || !book.locations) return;
    const cfi = book.locations.cfiFromLocation(pageNum);
    if (rendition) {
      rendition.display(cfi);
    }
  };

  // Handle thumbnail strip scroll
  const onThumbScroll = (e) => {
    setThumbScroll(e.target.scrollLeft);
  };

  // Zoom out handler
  const handleZoomOut = () => {
    setZoom((z) => Math.max(z - 0.1, 0.5));
    if (rendition) {
      rendition.resize(window.innerWidth * (zoom - 0.1), window.innerHeight * (zoom - 0.1));
    }
  };

  // Print handler
  const handlePrint = () => {
    if (!rendition) return;
    // epub.js paginated mode: get the current displayed iframe and only print the visible section
    const iframes = viewerRef.current ? viewerRef.current.querySelectorAll('iframe') : [];
    // Find the iframe that is currently visible (not display: none)
    let visibleIframe = null;
    iframes.forEach((iframe) => {
      const style = window.getComputedStyle(iframe);
      if (style.display !== 'none' && style.visibility !== 'hidden') {
        visibleIframe = iframe;
      }
    });
    if (!visibleIframe) return;
    const iframeDoc = visibleIframe.contentDocument || visibleIframe.contentWindow.document;
    // Only print the visible page's body
    const printWindow = window.open('', '', 'height=800,width=800');
    printWindow.document.write('<html><head><title>Print EPUB Page</title>');
    printWindow.document.write('<style>body{margin:0;padding:0;}@media print{body{zoom:1.1;}}</style>');
    printWindow.document.write('</head><body>');
    printWindow.document.write(iframeDoc.body.innerHTML);
    printWindow.document.write('</body></html>');
    printWindow.document.close();
    printWindow.focus();
    setTimeout(() => {
      printWindow.print();
      printWindow.close();
    }, 500);
  };

  // Navigation handlers
  const goPrev = () => {
    if (rendition && currentLocation && page > 1) {
      rendition.prev();
    }
  };

  const goNext = () => {
    if (rendition && currentLocation && page < totalPages) {
      rendition.next();
    }
  };

  // Handle file upload and book loading
  const handleFileChange = (e) => {
    setError("");
    const file = e.target.files[0];
    if (file) {
      setShowThumbnails(true);
      setThumbnails({});
      try {
        if (rendition) rendition.destroy();
        clearViewer();
        const reader = new FileReader();
        reader.onload = function(event) {
          const arrayBuffer = event.target.result;
          const newBook = ePub(arrayBuffer);
          setBook(newBook);
          setPage(1);
          setCurrentLocation(null);
          setTotalPages(0);
          // Render the book
          const newRendition = newBook.renderTo(viewerRef.current, {
            width: window.innerWidth * zoom,
            height: window.innerHeight * 0.8 * zoom,
            flow: 'paginated',
            allowScriptedContent: false,
          });
          setRendition(newRendition);
          newBook.ready.then(() => {
            newBook.locations.generate(1000).then(async () => {
              setTotalPages(newBook.locations.length());
              try {
                await newRendition.display();
              } catch (err) {
                // Suppress 'No Section Found' error
                // Optionally, setError('Failed to display first section');
              }
            });
          });
          newRendition.on('relocated', (location) => {
            setCurrentLocation(location);
            setPage(newBook.locations.locationFromCfi(location.start.cfi));
          });
        };
        reader.onerror = function() {
          setError("Failed to read EPUB file. Please try another file.");
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setError("Failed to load EPUB file. Please try another file.");
      }
    }
  };

  return (
    <div className="container fullpage">
      <div className="topbar">
        <h1>EPUB Reader</h1>
        <input type="file" accept=".epub" onChange={handleFileChange} />
        <button onClick={handleZoomIn} style={{marginLeft: 8}}>Zoom In</button>
        <button onClick={handleZoomOut} style={{marginLeft: 4}}>Zoom Out</button>
        <button onClick={handlePrint} style={{marginLeft: 8}}>Print</button>
        {book && totalPages > 1 && (
          <button onClick={() => setShowThumbnails(v => !v)} style={{marginLeft: 8}}>
            {showThumbnails ? 'Hide Thumbnails' : 'Show Thumbnails'}
          </button>
        )}
      </div>
      {error && <div style={{color: 'red', margin: '10px 0'}}>{error}</div>}
      <div className="viewer" ref={viewerRef}></div>
      {showThumbnails && book && totalPages > 1 && (
        <div
          className="thumbnail-strip"
          style={{
            display: 'flex',
            overflowX: 'auto',
            padding: '8px',
            background: '#f8f8f8',
            borderTop: '1px solid #eee',
            borderBottom: '1px solid #eee',
            gap: '8px',
            marginBottom: 8,
            maxWidth: '100vw',
          }}
          onScroll={onThumbScroll}
        >
          {Array.from({ length: totalPages }, (_, i) => (
            <div
              key={i + 1}
              style={{
                width: 100,
                height: 125,
                background: '#fff',
                border: page === i + 1 ? '2px solid #007bff' : '1px solid #ccc',
                borderRadius: 4,
                boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                cursor: 'pointer',
                position: 'relative',
                overflow: 'hidden',
              }}
              onClick={() => goToPage(i + 1)}
            >
              {thumbnails[i + 1] ? (
                <img
                  src={thumbnails[i + 1]}
                  alt={`Page ${i + 1}`}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span style={{ fontSize: 12, color: '#888' }}>Loading...</span>
              )}
              <span
                style={{
                  position: 'absolute',
                  bottom: 2,
                  right: 4,
                  background: 'rgba(255,255,255,0.7)',
                  fontSize: 10,
                  padding: '0 2px',
                  borderRadius: 2,
                }}
              >{i + 1}</span>
            </div>
          ))}
        </div>
      )}
      {book && (
        <div className="controls">
          <button onClick={goPrev} disabled={page <= 1}>Previous</button>
          <span>Page {page} of {totalPages}</span>
          <button onClick={goNext} disabled={page >= totalPages}>Next</button>
        </div>
      )}

    </div>
  );
}
export default App;

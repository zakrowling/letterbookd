/**
 * Book Library Application - Complete JS Engine (Fixed & Genre-Free)
 */

document.addEventListener('DOMContentLoaded', () => {
  // ==========================================
  // 1. CONSTANTS & CONFIGURATION
  // ==========================================
  const LOCAL_STORAGE_KEY = 'book_library_data_v7';
  const API_CACHE_KEY = 'book_library_api_cache_v4';

  const READING_STATUSES = {
    'read': { label: 'Read', color: 'bg-emerald-500/10 text-emerald-400 border-emerald-500/20' },
    'reading': { label: 'Currently Reading', color: 'bg-amber-500/10 text-amber-400 border-amber-500/20' },
    'want-to-read': { label: 'Want to Read', color: 'bg-blue-500/10 text-blue-400 border-blue-500/20' },
    'dnf': { label: 'Did Not Finish', color: 'bg-rose-500/10 text-rose-400 border-rose-800/20' }
  };

  // ==========================================
  // 2. STATE MANAGEMENT
  // ==========================================
  let state = {
    books: [],
    apiCache: {},
    currentView: 'grid', // 'grid', 'list', or 'shelf'
    sortBy: 'rating-desc',
    selectedBookId: null,
    isEnriching: false,
    filters: {
      searchQuery: '',
      status: 'all',
      minRating: 0,
      dateRead: ''
    }
  };

  // ==========================================
  // 3. DOM ELEMENTS
  // ==========================================
  const elements = {
    viewContainer: document.getElementById('view-container'),
    bookCount: document.getElementById('book-count'),
    enrichingIndicator: document.getElementById('enriching-indicator'),
    searchInput: document.getElementById('search-input'),
    sortSelect: document.getElementById('sort-select'),
    
    filterStatus: document.getElementById('filter-status'),
    filterRating: document.getElementById('filter-rating'),
    filterDateRead: document.getElementById('filter-date-read'),
    
    viewGridBtn: document.getElementById('view-grid-btn'),
    viewListBtn: document.getElementById('view-list-btn'),
    viewShelfBtn: document.getElementById('view-shelf-btn') || document.getElementById('view-3d-btn'),
    
    toastContainer: null,
    modalContainer: null,
    floatingTooltip: null
  };

  // Inject rating options including 5 Stars
  if (elements.filterRating) {
    elements.filterRating.innerHTML = `
      <option value="0">All Ratings</option>
      <option value="5">5 Stars</option>
      <option value="4">4 Stars</option>
      <option value="3">3 Stars</option>
      <option value="2">2 Stars</option>
      <option value="1">1 Star</option>
    `;
  }

  // ==========================================
  // 4. UTILITY FUNCTIONS & HELPERS
  // ==========================================
  function debounce(func, wait = 200) {
    let timeout;
    return function executedFunction(...args) {
      const later = () => {
        clearTimeout(timeout);
        func(...args);
      };
      clearTimeout(timeout);
      timeout = setTimeout(later, wait);
    };
  }

  function escapeHtml(str) {
    if (!str) return '';
    return String(str)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }

  function generateFallbackCover(title, author) {
    const cleanTitle = escapeHtml(title || 'Untitled');
    const cleanAuthor = escapeHtml(author || 'Unknown Author');

    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <defs>
        <linearGradient id="purpleGradient" x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stop-color="#281a2f"/>
          <stop offset="100%" stop-color="#17111d"/>
        </linearGradient>
      </defs>
      <rect width="100%" height="100%" fill="url(#purpleGradient)"/>
      <rect x="8" y="8" width="284" height="434" fill="none" stroke="#7e22ce" stroke-width="3" rx="4"/>
      <foreignObject x="20" y="40" width="260" height="370">
        <div xmlns="http://www.w3.org/1999/xhtml" style="height:100%; display:flex; flex-direction:column; justify-content:center; align-items:center; text-align:center; padding:16px; box-sizing:border-box;">
          <div style="color:#f3e8ff; font-family:-apple-system, BlinkMacSystemFont, sans-serif; font-size:20px; font-weight:800; text-transform:uppercase; letter-spacing:1px; line-height:1.3; margin-bottom:14px;">${cleanTitle}</div>
          <div style="color:#d8b4fe; font-family:-apple-system, BlinkMacSystemFont, sans-serif; font-size:14px; font-style:italic;">${cleanAuthor}</div>
        </div>
      </foreignObject>
    </svg>`;

    return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
  }

  function showToast(message, type = 'info') {
    if (!elements.toastContainer) {
      elements.toastContainer = document.createElement('div');
      elements.toastContainer.className = 'fixed bottom-5 right-5 z-50 flex flex-col gap-2 pointer-events-none';
      document.body.appendChild(elements.toastContainer);
    }

    const toast = document.createElement('div');
    const bgColors = {
      info: 'bg-zinc-800 text-white border-zinc-700',
      success: 'bg-emerald-950 text-emerald-200 border-emerald-800',
      error: 'bg-rose-950 text-rose-200 border-rose-800'
    };

    toast.className = `pointer-events-auto px-4 py-3 rounded-lg border text-xs font-medium shadow-xl transition-all duration-300 transform translate-y-2 opacity-0 flex items-center gap-2 ${bgColors[type] || bgColors.info}`;
    toast.innerHTML = `<span>${escapeHtml(message)}</span>`;

    elements.toastContainer.appendChild(toast);

    requestAnimationFrame(() => {
      toast.classList.remove('translate-y-2', 'opacity-0');
    });

    setTimeout(() => {
      toast.classList.add('translate-y-2', 'opacity-0');
      setTimeout(() => toast.remove(), 300);
    }, 3500);
  }

  // ==========================================
  // 5. GLOBAL FLOATING TOOLTIP FOR SHELF VIEW
  // ==========================================
  function setupFloatingTooltip() {
    if (!elements.floatingTooltip) {
      const tooltip = document.createElement('div');
      tooltip.id = 'global-shelf-tooltip';
      tooltip.className = 'fixed z-50 pointer-events-none hidden transition-opacity duration-150 transform -translate-x-1/2 -translate-y-full mb-2';
      tooltip.innerHTML = `
        <div class="bg-zinc-900 border border-zinc-700 text-white p-3 rounded-xl shadow-2xl text-center text-xs max-w-xs min-w-[180px]">
          <p id="tooltip-title" class="font-bold text-amber-400 line-clamp-2"></p>
          <p id="tooltip-author" class="text-zinc-400 text-[11px] mt-0.5 line-clamp-1"></p>
          <p id="tooltip-meta" class="text-zinc-500 text-[10px] mt-1 font-mono"></p>
        </div>
        <div class="w-2.5 h-2.5 bg-zinc-900 border-r border-b border-zinc-700 transform rotate-45 -mt-1.5 mx-auto"></div>
      `;
      document.body.appendChild(tooltip);
      elements.floatingTooltip = tooltip;
    }
  }

  function showFloatingTooltip(e, book) {
    if (!elements.floatingTooltip) setupFloatingTooltip();

    const titleEl = document.getElementById('tooltip-title');
    const authorEl = document.getElementById('tooltip-author');
    const metaEl = document.getElementById('tooltip-meta');

    if (titleEl) titleEl.textContent = book.title || 'Untitled';
    if (authorEl) authorEl.textContent = book.authors ? book.authors.join(', ') : 'Unknown Author';
    if (metaEl) metaEl.textContent = `${book.pageCount || '?'} pages • ${book.dateRead ? `Read ${book.dateRead}` : 'Unread'}`;

    updateFloatingTooltipPos(e);
    elements.floatingTooltip.classList.remove('hidden');
    elements.floatingTooltip.style.opacity = '1';
  }

  function updateFloatingTooltipPos(e) {
    if (!elements.floatingTooltip) return;
    const padding = 12;
    const x = Math.max(100, Math.min(window.innerWidth - 100, e.clientX));
    const y = Math.max(10, e.clientY - padding);
    elements.floatingTooltip.style.left = `${x}px`;
    elements.floatingTooltip.style.top = `${y}px`;
  }

  function hideFloatingTooltip() {
    if (elements.floatingTooltip) {
      elements.floatingTooltip.style.opacity = '0';
      elements.floatingTooltip.classList.add('hidden');
    }
  }

  // ==========================================
  // 6. DATA NORMALIZATION & LOADING
  // ==========================================
  function getRawInitialBooks() {
    // Check direct scope variables first (e.g. from data.js)
    const directVariables = [
      typeof GOODREADS_EXPORT_DATA !== 'undefined' ? GOODREADS_EXPORT_DATA : null,
      typeof books !== 'undefined' ? books : null,
      typeof initialBooks !== 'undefined' ? initialBooks : null,
      typeof BOOKS !== 'undefined' ? BOOKS : null,
      typeof INITIAL_BOOKS !== 'undefined' ? INITIAL_BOOKS : null,
      typeof DATA !== 'undefined' ? DATA : null,
      typeof libraryBooks !== 'undefined' ? libraryBooks : null,
      typeof bookData !== 'undefined' ? bookData : null,
      typeof myBooks !== 'undefined' ? myBooks : null
    ];

    for (const v of directVariables) {
      if (Array.isArray(v) && v.length > 0) return v;
      if (v && typeof v === 'object' && Array.isArray(v.books) && v.books.length > 0) return v.books;
    }

    // Check window properties as fallback
    const candidateGlobals = [
      window.GOODREADS_EXPORT_DATA,
      window.goodreads_data,
      window.GOODREADS_DATA,
      window.books,
      window.initialBooks,
      window.BOOKS,
      window.INITIAL_BOOKS,
      window.DATA,
      window.libraryBooks,
      window.bookData,
      window.myBooks,
      window.exportData
    ];

    for (const g of candidateGlobals) {
      if (Array.isArray(g) && g.length > 0) return g;
      if (g && typeof g === 'object' && Array.isArray(g.books) && g.books.length > 0) return g.books;
    }

    // Fallback: scan all window keys for any array containing books
    for (const key of Object.keys(window)) {
      try {
        const val = window[key];
        if (Array.isArray(val) && val.length > 0 && (val[0].Title || val[0].title || val[0]['Book Id'])) {
          return val;
        }
      } catch (e) {}
    }

    return [];
  }

  function normalizeBook(rawBook, index) {
    if (!rawBook || typeof rawBook !== 'object') return null;

    let authors = [];
    if (Array.isArray(rawBook.authors)) authors = rawBook.authors;
    else if (Array.isArray(rawBook.author)) authors = rawBook.author;
    else if (typeof rawBook.author === 'string' && rawBook.author.trim()) authors = [rawBook.author.trim()];
    else if (typeof rawBook.authors === 'string' && rawBook.authors.trim()) authors = rawBook.authors.split(',').map(a => a.trim());
    else if (typeof rawBook['Author'] === 'string' && rawBook['Author'].trim()) authors = [rawBook['Author'].trim()];

    let status = 'read';
    const rawShelf = String(rawBook['Exclusive Shelf'] || rawBook.shelf || rawBook.status || '').toLowerCase();
    if (rawShelf === 'to-read' || rawShelf === 'want-to-read') {
      status = 'want-to-read';
    } else if (rawShelf === 'currently-reading' || rawShelf === 'reading') {
      status = 'reading';
    } else if (rawShelf === 'dnf') {
      status = 'dnf';
    }

    const rawRating = rawBook['My Rating'] !== undefined ? rawBook['My Rating'] : (rawBook.myRating !== undefined ? rawBook.myRating : (rawBook.userRating !== undefined ? rawBook.userRating : rawBook.rating));
    const userRating = parseFloat(rawRating) || 0;
    const pageCount = parseInt(rawBook['Number of Pages'] || rawBook.pages || rawBook.pageCount || 0, 10) || 0;
    const isbn13 = String(rawBook.isbn13 || rawBook.ISBN13 || '').replace(/[^0-9X]/gi, '');
    const isbn = String(rawBook.isbn || rawBook.ISBN || '').replace(/[^0-9X]/gi, '');

    let coverUrl = rawBook.coverUrl || rawBook.cover || rawBook.image || rawBook.thumbnail || '';
    if (!coverUrl && isbn13) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
    } else if (!coverUrl && isbn) {
      coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    }

    const publishedDate = String(rawBook.publishedDate || rawBook.year || rawBook.first_publish_year || '');

    return {
      id: String(rawBook['Book Id'] || rawBook.BookId || rawBook.id !== undefined ? (rawBook['Book Id'] || rawBook.BookId || rawBook.id) : `book-${index + 1}-${Date.now()}`),
      title: rawBook.Title || rawBook.title || 'Untitled Book',
      authors: authors.length > 0 ? authors : ['Unknown Author'],
      coverUrl: coverUrl,
      userRating: isNaN(userRating) ? 0 : userRating,
      dateRead: rawBook['Date Read'] || rawBook.dateRead || rawBook.readDate || '',
      status: status,
      pageCount: pageCount,
      publishedDate: publishedDate,
      publisher: rawBook.Publisher || rawBook.publisher || '',
      description: rawBook['My Review'] || rawBook.MyReview || rawBook.myReview || rawBook.description || '',
      isbn13: isbn13,
      isbn: isbn,
      ratingsCount: rawBook.ratingsCount || 0,
      infoLink: rawBook.infoLink || (isbn13 ? `https://openlibrary.org/isbn/${isbn13}` : '')
    };
  }

  function loadStoredData() {
    try {
      const rawFileBooks = getRawInitialBooks().map((b, idx) => normalizeBook(b, idx)).filter(Boolean);
      const storedBooksJson = localStorage.getItem(LOCAL_STORAGE_KEY);

      if (storedBooksJson) {
        const storedBooks = JSON.parse(storedBooksJson);
        if (Array.isArray(storedBooks) && storedBooks.length > 0) {
          const storedMap = new Map(storedBooks.map(b => [b.id, b]));
          rawFileBooks.forEach(fileBook => {
            if (!storedMap.has(fileBook.id)) {
              storedMap.set(fileBook.id, fileBook);
            }
          });
          state.books = Array.from(storedMap.values());
        } else {
          state.books = rawFileBooks;
        }
      } else {
        state.books = rawFileBooks;
      }

      saveBooksToStorage();

      const storedCache = localStorage.getItem(API_CACHE_KEY);
      if (storedCache) {
        state.apiCache = JSON.parse(storedCache);
      }
    } catch (err) {
      console.error('Error loading book data:', err);
      state.books = getRawInitialBooks().map((b, idx) => normalizeBook(b, idx)).filter(Boolean);
    }
  }

  function saveBooksToStorage() {
    try {
      localStorage.setItem(LOCAL_STORAGE_KEY, JSON.stringify(state.books));
    } catch (err) {
      console.error('Failed to save books:', err);
    }
  }

  function saveCacheToStorage() {
    try {
      localStorage.setItem(API_CACHE_KEY, JSON.stringify(state.apiCache));
    } catch (err) {
      console.error('Failed to save API cache:', err);
    }
  }

  // ==========================================
  // 7. DUAL API METADATA ENRICHMENT
  // ==========================================
  async function fetchGoogleBooksData(title, author, isbn) {
    const cacheKey = `gb_${isbn || title}_${author || ''}`.toLowerCase();
    if (state.apiCache[cacheKey]) return state.apiCache[cacheKey];

    try {
      let query = isbn ? `isbn:${isbn}` : `intitle:${title}${author ? ` inauthor:${author}` : ''}`;
      const url = `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(query)}&maxResults=1`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.items || data.items.length === 0) return null;

      const info = data.items[0].volumeInfo;

      let coverUrl = info.imageLinks?.extraLarge || info.imageLinks?.large || info.imageLinks?.medium || info.imageLinks?.thumbnail || info.imageLinks?.smallThumbnail || '';
      if (coverUrl) {
        coverUrl = coverUrl.replace('http://', 'https://');
      }

      const result = {
        coverUrl: coverUrl,
        description: info.description || '',
        publisher: info.publisher || '',
        pageCount: info.pageCount || 0,
        publishedDate: info.publishedDate ? info.publishedDate.substring(0, 4) : '',
        ratingsCount: info.ratingsCount || 0,
        infoLink: info.infoLink || ''
      };

      state.apiCache[cacheKey] = result;
      saveCacheToStorage();
      return result;
    } catch (err) {
      return null;
    }
  }

  async function fetchOpenLibraryData(title, author, isbn) {
    const cacheKey = `ol_${isbn || title}_${author || ''}`.toLowerCase();
    if (state.apiCache[cacheKey]) return state.apiCache[cacheKey];

    try {
      const query = isbn ? `isbn:${isbn}` : `${title} ${author || ''}`.trim();
      const url = `https://openlibrary.org/search.json?q=${encodeURIComponent(query)}&limit=1`;
      const response = await fetch(url);
      if (!response.ok) return null;

      const data = await response.json();
      if (!data.docs || data.docs.length === 0) return null;

      const doc = data.docs[0];

      let coverUrl = doc.cover_i ? `https://covers.openlibrary.org/b/id/${doc.cover_i}-L.jpg` : '';

      const result = {
        coverUrl: coverUrl,
        description: doc.first_sentence ? (Array.isArray(doc.first_sentence) ? doc.first_sentence.join(' ') : doc.first_sentence) : '',
        publisher: Array.isArray(doc.publisher) ? doc.publisher[0] : (doc.publisher || ''),
        pageCount: doc.number_of_pages_median || 0,
        publishedDate: doc.first_publish_year ? String(doc.first_publish_year) : '',
        infoLink: doc.key ? `https://openlibrary.org${doc.key}` : ''
      };

      state.apiCache[cacheKey] = result;
      saveCacheToStorage();
      return result;
    } catch (err) {
      return null;
    }
  }

  async function enrichBook(book) {
    const author = book.authors ? book.authors[0] : '';
    const isbn = book.isbn13 || book.isbn || '';

    const gData = await fetchGoogleBooksData(book.title, author, isbn);
    const olData = await fetchOpenLibraryData(book.title, author, isbn);

    let coverUrl = book.coverUrl;
    if (!coverUrl) {
      coverUrl = gData?.coverUrl || olData?.coverUrl || (isbn ? `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg` : '');
    }

    if (!coverUrl) {
      coverUrl = generateFallbackCover(book.title, author);
    }

    return {
      ...book,
      coverUrl: coverUrl,
      description: book.description || gData?.description || olData?.description || '',
      publisher: book.publisher || gData?.publisher || olData?.publisher || '',
      pageCount: book.pageCount || gData?.pageCount || olData?.pageCount || 0,
      publishedDate: book.publishedDate || gData?.publishedDate || olData?.publishedDate || '',
      ratingsCount: book.ratingsCount || gData?.ratingsCount || 0,
      infoLink: book.infoLink || gData?.infoLink || olData?.infoLink || ''
    };
  }

  async function enrichAllBooks() {
    if (state.isEnriching || state.books.length === 0) return;
    state.isEnriching = true;
    
    if (elements.enrichingIndicator) {
      elements.enrichingIndicator.classList.remove('hidden');
    }

    try {
      const enriched = await Promise.all(state.books.map(b => enrichBook(b)));
      state.books = enriched;
      saveBooksToStorage();
      render();
    } catch (err) {
      console.error('Enrichment error:', err);
    } finally {
      state.isEnriching = false;
      if (elements.enrichingIndicator) {
        elements.enrichingIndicator.classList.add('hidden');
      }
    }
  }

  // ==========================================
  // 8. FILTER & SORT ENGINE
  // ==========================================
  function getProcessedBooks() {
    let result = state.books.filter(book => {
      if (state.filters.searchQuery) {
        const query = state.filters.searchQuery.toLowerCase();
        const titleMatch = book.title && book.title.toLowerCase().includes(query);
        const authorMatch = book.authors && book.authors.some(a => a.toLowerCase().includes(query));
        if (!titleMatch && !authorMatch) return false;
      }

      if (state.filters.status !== 'all') {
        if (book.status !== state.filters.status) {
          return false;
        }
      }

      if (state.filters.minRating > 0) {
        if ((book.userRating || 0) < state.filters.minRating) {
          return false;
        }
      }

      if (state.filters.dateRead) {
        if (!book.dateRead || !book.dateRead.includes(state.filters.dateRead)) {
          return false;
        }
      }

      return true;
    });

    const sorted = [...result];

    if (state.sortBy === 'shuffle') {
      for (let i = sorted.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [sorted[i], sorted[j]] = [sorted[j], sorted[i]];
      }
      return sorted;
    }

    switch (state.sortBy) {
      case 'rating-desc':
        return sorted.sort((a, b) => (b.userRating || 0) - (a.userRating || 0));
      case 'rating-asc':
        return sorted.sort((a, b) => (a.userRating || 0) - (b.userRating || 0));
      case 'title-asc':
        return sorted.sort((a, b) => (a.title || '').localeCompare(b.title || ''));
      case 'title-desc':
        return sorted.sort((a, b) => (b.title || '').localeCompare(a.title || ''));
      case 'pages-desc':
        return sorted.sort((a, b) => (b.pageCount || 0) - (a.pageCount || 0));
      case 'pages-asc':
        return sorted.sort((a, b) => (a.pageCount || 0) - (b.pageCount || 0));
      case 'least-popular':
        return sorted.sort((a, b) => (a.ratingsCount || 0) - (b.ratingsCount || 0));
      default:
        return sorted;
    }
  }

  // ==========================================
  // 9. RENDERERS (Grid, List, Shelf)
  // ==========================================
  function renderGrid(books) {
    return `
      <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
        ${books.map(book => {
          const statusInfo = READING_STATUSES[book.status] || READING_STATUSES['read'];
          const fallback = generateFallbackCover(book.title, book.authors ? book.authors[0] : '');
          return `
            <div 
              data-id="${book.id}"
              class="book-card group relative bg-zinc-900 border border-zinc-800/80 hover:border-zinc-600 rounded-lg overflow-hidden transition-all duration-300 flex flex-col cursor-pointer shadow-md hover:shadow-xl hover:-translate-y-1"
            >
              <div class="aspect-[2/3] w-full bg-zinc-800 relative overflow-hidden">
                <img
                  src="${escapeHtml(book.coverUrl || fallback)}"
                  alt="${escapeHtml(book.title)}"
                  loading="lazy"
                  class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500"
                  onerror="this.onerror=null; this.src='${fallback}'"
                />
                
                ${book.userRating ? `
                  <div class="absolute top-2 right-2 bg-black/80 backdrop-blur-md px-2 py-0.5 rounded text-amber-400 font-bold text-xs flex items-center gap-1 shadow-lg border border-amber-500/20">
                    <span>★</span>
                    <span>${book.userRating.toFixed(1)}</span>
                  </div>
                ` : ''}

                <div class="absolute bottom-2 left-2">
                  <span class="text-[10px] px-2 py-0.5 rounded-full border backdrop-blur-md ${statusInfo.color}">
                    ${statusInfo.label}
                  </span>
                </div>
              </div>

              <div class="p-3 flex flex-col flex-1 justify-between bg-zinc-900/90">
                <div>
                  <h3 class="text-white font-semibold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">
                    ${escapeHtml(book.title)}
                  </h3>
                  <p class="text-zinc-400 text-xs line-clamp-1 mt-0.5">
                    ${escapeHtml(book.authors ? book.authors.join(', ') : 'Unknown Author')}
                  </p>
                </div>

                <div class="flex items-center justify-between text-[10px] text-zinc-500 mt-3 pt-2 border-t border-zinc-800/60">
                  <span>${book.dateRead ? `Read ${book.dateRead}` : ''}</span>
                  <span>${book.pageCount ? `${book.pageCount} pgs` : ''}</span>
                </div>
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderList(books) {
    return `
      <div class="flex flex-col gap-2 w-full">
        <!-- Table Header -->
        <div class="hidden sm:grid grid-cols-12 gap-4 px-4 py-2 text-xs font-semibold text-zinc-500 uppercase tracking-wider border-b border-zinc-800">
          <div class="col-span-1">Cover</div>
          <div class="col-span-5">Title & Author</div>
          <div class="col-span-3 text-center">Status</div>
          <div class="col-span-1 text-right">Pages</div>
          <div class="col-span-2 text-right">Rating</div>
        </div>

        ${books.map(book => {
          const statusInfo = READING_STATUSES[book.status] || READING_STATUSES['read'];
          const fallback = generateFallbackCover(book.title, book.authors ? book.authors[0] : '');
          return `
            <div 
              data-id="${book.id}"
              class="book-card list-row grid grid-cols-2 sm:grid-cols-12 gap-4 items-center bg-zinc-900/60 hover:bg-zinc-900 p-3 rounded-lg border border-zinc-800/80 hover:border-zinc-700 transition-all duration-200 cursor-pointer"
            >
              <!-- Cover -->
              <div class="col-span-1 shrink-0">
                <img
                  src="${escapeHtml(book.coverUrl || fallback)}"
                  alt="${escapeHtml(book.title)}"
                  loading="lazy"
                  class="w-10 h-14 object-cover rounded shadow bg-zinc-800"
                  onerror="this.onerror=null; this.src='${fallback}'"
                />
              </div>

              <!-- Title & Author -->
              <div class="col-span-1 sm:col-span-5 min-w-0">
                <h3 class="text-white font-semibold text-sm truncate hover:text-amber-400 transition-colors">
                  ${escapeHtml(book.title)}
                </h3>
                <p class="text-zinc-400 text-xs truncate mt-0.5">
                  ${escapeHtml(book.authors ? book.authors.join(', ') : 'Unknown Author')}
                </p>
              </div>

              <!-- Status -->
              <div class="hidden sm:block col-span-3 text-center">
                <span class="text-[10px] px-2 py-0.5 rounded-full border ${statusInfo.color} inline-block truncate">
                  ${statusInfo.label}
                </span>
              </div>

              <!-- Pages -->
              <div class="hidden sm:block col-span-1 text-right text-xs font-mono text-zinc-400">
                ${book.pageCount ? `${book.pageCount} p` : '—'}
              </div>

              <!-- Rating -->
              <div class="col-span-1 sm:col-span-2 text-right font-bold text-amber-400 text-sm">
                ${book.userRating ? `★ ${book.userRating.toFixed(1)}` : '—'}
              </div>
            </div>
          `;
        }).join('')}
      </div>
    `;
  }

  function renderShelf(books) {
    return `
      <div class="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
        <div class="text-xs text-zinc-400 mb-4 flex items-center justify-between">
          <span>Bookshelf — Click any spine to open details</span>
          <span class="text-zinc-500">${books.length} Books on Shelf</span>
        </div>

        <div class="shelf-viewport relative min-w-full pt-10 pb-0 px-6 bg-zinc-900/40 rounded-t-xl border-t border-l border-r border-zinc-800/80 flex items-end justify-start gap-1 overflow-x-auto min-h-[310px]">
          ${books.map((book) => {
            const pages = book.pageCount || 250;
            const spineWidth = Math.min(Math.max(Math.floor(pages / 10), 32), 68);
            const spineHeight = Math.min(Math.max(Math.floor(pages / 3) + 180, 220), 280);
            
            let hash = 0;
            for (let i = 0; i < book.title.length; i++) {
              hash = book.title.charCodeAt(i) + ((hash << 5) - hash);
            }
            const hue = Math.abs(hash) % 360;
            const spineBg = `hsl(${hue}, 35%, 18%)`;
            const spineBorder = `hsl(${hue}, 40%, 28%)`;
            const accentColor = `hsl(${hue}, 80%, 75%)`;

            const fontSize = Math.max(9, Math.min(12, Math.floor(spineWidth * 0.28)));

            return `
              <div
                data-id="${book.id}"
                class="book-card book-spine group relative flex-shrink-0 cursor-pointer rounded-none transition-all duration-300 transform hover:-translate-y-4 hover:z-30 select-none"
                style="width: ${spineWidth}px; height: ${spineHeight}px;"
              >
                <div 
                  class="w-full h-full rounded-t flex flex-col justify-between py-3 px-1 shadow-lg border-t border-l border-r border-white/10 transition-all duration-300 group-hover:brightness-125 overflow-hidden"
                  style="background-color: ${spineBg}; border-color: ${spineBorder};"
                >
                  <div class="flex justify-center shrink-0">
                    <span class="text-[9px] font-mono text-amber-400 font-bold tracking-tighter">
                      ${book.userRating ? `★${book.userRating.toFixed(1)}` : ''}
                    </span>
                  </div>

                  <div class="flex-1 flex items-center justify-center overflow-hidden my-1">
                    <span 
                      class="font-bold tracking-wider uppercase text-center overflow-hidden"
                      style="
                        writing-mode: vertical-rl; 
                        transform: rotate(180deg); 
                        color: ${accentColor}; 
                        font-size: ${fontSize}px;
                        max-height: ${spineHeight - 50}px;
                        white-space: nowrap;
                        text-overflow: ellipsis;
                        letter-spacing: 0.5px;
                      "
                    >
                      ${escapeHtml(book.title)}
                    </span>
                  </div>
                </div>
              </div>
            `;
          }).join('')}
        </div>

        <div class="h-5 w-full bg-gradient-to-r from-amber-950 via-zinc-800 to-amber-950 rounded-b-lg border-t border-amber-700/40 shadow-2xl"></div>
      </div>
    `;
  }

  // ==========================================
  // 10. MODAL & DETAILS VIEW
  // ==========================================
  function openBookModal(bookId) {
    const book = state.books.find(b => b.id === bookId);
    if (!book) return;

    state.selectedBookId = bookId;

    if (!elements.modalContainer) {
      elements.modalContainer = document.createElement('div');
      elements.modalContainer.id = 'book-modal-backdrop';
      elements.modalContainer.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 overflow-y-auto';
      document.body.appendChild(elements.modalContainer);
    }

    const statusInfo = READING_STATUSES[book.status] || READING_STATUSES['read'];
    const fallback = generateFallbackCover(book.title, book.authors ? book.authors[0] : '');

    elements.modalContainer.innerHTML = `
      <div class="bg-zinc-900 border border-zinc-800 rounded-2xl max-w-2xl w-full p-6 shadow-2xl relative overflow-hidden text-zinc-100">
        <button id="modal-close-btn" class="absolute top-4 right-4 text-zinc-400 hover:text-white bg-zinc-800 hover:bg-zinc-700 w-8 h-8 rounded-full flex items-center justify-center text-lg transition-colors">
          ✕
        </button>

        <div class="flex flex-col sm:flex-row gap-6">
          <div class="w-full sm:w-48 shrink-0 flex flex-col items-center">
            <img 
              src="${escapeHtml(book.coverUrl || fallback)}" 
              alt="${escapeHtml(book.title)}"
              class="w-full max-w-[180px] sm:max-w-none aspect-[2/3] object-cover rounded-xl shadow-xl border border-zinc-800"
              onerror="this.onerror=null; this.src='${fallback}'"
            />
            
            <div class="mt-4 w-full text-center">
              <span class="inline-block text-xs font-semibold px-3 py-1 rounded-full border ${statusInfo.color}">
                ${statusInfo.label}
              </span>
            </div>
          </div>

          <div class="flex-1 space-y-4">
            <div>
              <h2 class="text-xl sm:text-2xl font-bold text-white leading-snug">${escapeHtml(book.title)}</h2>
              <p class="text-zinc-400 text-sm mt-1">
                by ${escapeHtml(book.authors ? book.authors.join(', ') : 'Unknown Author')}
              </p>
            </div>

            <div class="flex flex-wrap items-center gap-3 text-xs">
              <div class="bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700 flex items-center gap-1.5 text-amber-400 font-bold">
                <span>★</span>
                <span>${book.userRating ? book.userRating.toFixed(1) : 'Unrated'}</span>
              </div>

              <div class="bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300">
                ${book.pageCount ? `${book.pageCount} Pages` : 'Page count unknown'}
              </div>

              ${book.dateRead ? `
                <div class="bg-zinc-800 px-3 py-1.5 rounded-lg border border-zinc-700 text-zinc-300">
                  Read ${escapeHtml(book.dateRead)}
                </div>
              ` : ''}
            </div>

            ${book.description ? `
              <div class="space-y-1">
                <h4 class="text-xs font-semibold text-zinc-400 uppercase tracking-wider">Summary / Review</h4>
                <p class="text-xs text-zinc-400 max-h-40 overflow-y-auto leading-relaxed pr-2">
                  ${escapeHtml(book.description)}
                </p>
              </div>
            ` : ''}

            <div class="flex items-center justify-between border-t border-zinc-800 pt-4 mt-4">
              ${book.infoLink ? `
                <a href="${escapeHtml(book.infoLink)}" target="_blank" rel="noopener noreferrer" class="text-xs text-amber-400 hover:underline flex items-center gap-1">
                  More Info ↗
                </a>
              ` : '<div></div>'}

              <button id="modal-delete-btn" class="bg-rose-950/80 hover:bg-rose-900 text-rose-200 border border-rose-800 px-3 py-1.5 rounded-lg text-xs font-medium transition-colors">
                Delete
              </button>
            </div>
          </div>
        </div>
      </div>
    `;

    document.getElementById('modal-close-btn').addEventListener('click', closeModal);
    document.getElementById('modal-delete-btn').addEventListener('click', () => {
      if (confirm(`Are you sure you want to delete "${book.title}"?`)) {
        state.books = state.books.filter(b => b.id !== bookId);
        saveBooksToStorage();
        closeModal();
        render();
        showToast('Book deleted', 'success');
      }
    });
  }

  function closeModal() {
    if (elements.modalContainer) {
      elements.modalContainer.remove();
      elements.modalContainer = null;
      state.selectedBookId = null;
    }
  }

  // ==========================================
  // 11. CONTROLLER & EVENT LISTENERS
  // ==========================================
  function render() {
    const processedBooks = getProcessedBooks();
    
    if (elements.bookCount) {
      elements.bookCount.textContent = `Showing ${processedBooks.length} of ${state.books.length} entries`;
    }

    if (!elements.viewContainer) return;

    if (processedBooks.length === 0) {
      elements.viewContainer.innerHTML = `
        <div class="py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
          <p class="text-base font-semibold">No books match your criteria</p>
          <p class="text-xs text-zinc-600 mt-1">Try adjusting your filters or search query.</p>
        </div>
      `;
      return;
    }

    switch (state.currentView) {
      case 'grid':
        elements.viewContainer.innerHTML = renderGrid(processedBooks);
        break;
      case 'list':
        elements.viewContainer.innerHTML = renderList(processedBooks);
        break;
      case 'shelf':
      case '3d':
        elements.viewContainer.innerHTML = renderShelf(processedBooks);
        break;
      default:
        elements.viewContainer.innerHTML = renderGrid(processedBooks);
    }

    const processedMap = new Map(processedBooks.map(b => [b.id, b]));

    document.querySelectorAll('.book-card').forEach(card => {
      const id = card.dataset.id;
      const book = processedMap.get(id);

      card.addEventListener('click', () => {
        if (id) {
          hideFloatingTooltip();
          openBookModal(id);
        }
      });

      if (state.currentView === 'shelf' || state.currentView === '3d') {
        card.addEventListener('mouseenter', (e) => {
          if (book) showFloatingTooltip(e, book);
        });
        card.addEventListener('mousemove', (e) => {
          updateFloatingTooltipPos(e);
        });
        card.addEventListener('mouseleave', () => {
          hideFloatingTooltip();
        });
      }
    });
  }

  function setupEventListeners() {
    if (elements.viewGridBtn) {
      elements.viewGridBtn.textContent = 'Grid';
      elements.viewGridBtn.addEventListener('click', () => {
        state.currentView = 'grid';
        updateViewButtonStyles(elements.viewGridBtn);
        hideFloatingTooltip();
        render();
      });
    }

    if (elements.viewListBtn) {
      elements.viewListBtn.textContent = 'List';
      elements.viewListBtn.addEventListener('click', () => {
        state.currentView = 'list';
        updateViewButtonStyles(elements.viewListBtn);
        hideFloatingTooltip();
        render();
      });
    }

    if (elements.viewShelfBtn) {
      elements.viewShelfBtn.textContent = 'Shelf';
      elements.viewShelfBtn.addEventListener('click', () => {
        state.currentView = 'shelf';
        updateViewButtonStyles(elements.viewShelfBtn);
        render();
      });
    }

    if (elements.searchInput) {
      elements.searchInput.addEventListener('input', debounce((e) => {
        state.filters.searchQuery = e.target.value;
        render();
      }, 200));
    }

    if (elements.sortSelect) {
      elements.sortSelect.addEventListener('change', (e) => {
        state.sortBy = e.target.value;
        render();
        if (e.target.value === 'shuffle') {
          showToast('Library shuffled randomly!', 'info');
        }
      });
    }

    if (elements.filterStatus) {
      elements.filterStatus.addEventListener('change', (e) => {
        state.filters.status = e.target.value;
        render();
      });
    }

    if (elements.filterRating) {
      elements.filterRating.addEventListener('change', (e) => {
        state.filters.minRating = parseFloat(e.target.value) || 0;
        render();
      });
    }

    if (elements.filterDateRead) {
      elements.filterDateRead.addEventListener('change', (e) => {
        state.filters.dateRead = e.target.value;
        render();
      });
    }

    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') closeModal();
    });
  }

  function updateViewButtonStyles(activeBtn) {
    [elements.viewGridBtn, elements.viewListBtn, elements.viewShelfBtn].forEach(btn => {
      if (!btn) return;
      if (btn === activeBtn) {
        btn.classList.add('bg-zinc-700', 'text-white');
        btn.classList.remove('text-zinc-400');
      } else {
        btn.classList.remove('bg-zinc-700', 'text-white');
        btn.classList.add('text-zinc-400');
      }
    });
  }

  function init() {
    loadStoredData();
    setupEventListeners();
    setupFloatingTooltip();
    
    if (elements.viewGridBtn) updateViewButtonStyles(elements.viewGridBtn);
    
    render();
    enrichAllBooks();
  }

  init();
});
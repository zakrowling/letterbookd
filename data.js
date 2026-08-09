// ==========================================
// Letterbookd - Data & UI Management Engine
// ==========================================

let booksData = [];
let filteredBooks = [];
let currentView = 'grid'; // 'grid', 'list', 'shelf'
let activeGenre = 'all';

document.addEventListener('DOMContentLoaded', () => {
  initializeTheme();
  
  // Robust check for any initial Goodreads dataset variable
  const rawBooks = getRawInitialBooks();
  if (rawBooks && rawBooks.length > 0) {
    processBooks(rawBooks);
  } else {
    console.warn("No Goodreads dataset found on window! Check your data export JS file.");
    updateStatsSummary();
    renderCurrentView();
  }

  setupEventListeners();
  setupModalListeners();
});

function getRawInitialBooks() {
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

/**
 * Normalizes raw input data and handles multi-genre parsing
 */
function processBooks(rawBooks) {
  if (!Array.isArray(rawBooks)) return;

  booksData = rawBooks.map((b, idx) => {
    const bookId = String(b['Book Id'] || b.BookId || b.id || `book-${idx + 1}`);
    const isbn13 = cleanISBN(b.ISBN13 || b.isbn13);
    const isbn = cleanISBN(b.ISBN || b.isbn);

    // Parse Comma-Separated & Array Genres
    const rawGenreSources = [b.genres, b.genre, b.Genre, b.Genres, b.Bookshelves, b.bookshelves];
    let extractedGenres = [];

    rawGenreSources.forEach(source => {
      if (!source) return;
      if (Array.isArray(source)) {
        source.forEach(item => {
          if (typeof item === 'string') {
            item.split(',').forEach(g => extractedGenres.push(g.trim()));
          }
        });
      } else if (typeof source === 'string') {
        source.split(',').forEach(g => extractedGenres.push(g.trim()));
      }
    });

    const excludeList = new Set(['to-read', 'currently-reading', 'read', 'dnf', 'owned', 'all', '']);
    const genresArray = Array.from(new Set(
      extractedGenres
        .map(g => g.trim())
        .filter(g => g && !excludeList.has(g.toLowerCase()))
    ));

    // Resolve cover art paths
    let coverUrl = b.coverUrl || b.cover || b.image || b.thumbnail || '';
    if (!coverUrl) {
      if (isbn13) coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn13}-L.jpg`;
      else if (isbn) coverUrl = `https://covers.openlibrary.org/b/isbn/${isbn}-L.jpg`;
    }

    const rawDateRead = b['Date Read'] || b.dateRead || b.readDate || '';
    const readYear = parseReadYear(rawDateRead);
    const rawShelf = String(b['Exclusive Shelf'] || b.shelf || b.status || 'read').toLowerCase();
    
    let shelf = 'read';
    if (rawShelf === 'to-read' || rawShelf === 'want-to-read') shelf = 'want-to-read';
    else if (rawShelf === 'currently-reading' || rawShelf === 'reading') shelf = 'reading';
    else if (rawShelf === 'dnf') shelf = 'dnf';

    return {
      id: bookId,
      title: b.Title || b.title || 'Untitled Book',
      author: b.Author || b.author || b['Author l-f'] || (Array.isArray(b.authors) ? b.authors.join(', ') : 'Unknown Author'),
      shelf: shelf,
      genre: genresArray.join(', '),
      genres: genresArray,
      myRating: parseFloat(b['My Rating'] || b.myRating || b.userRating || b.rating || 0),
      pages: parseInt(b['Number of Pages'] || b.pages || b.pageCount || 0, 10) || 0,
      publisher: b.Publisher || b.publisher || 'Unknown Publisher',
      dateRead: rawDateRead,
      readYear: readYear,
      isbn: isbn,
      isbn13: isbn13,
      myReview: b['My Review'] || b.MyReview || b.myReview || b.description || '',
      coverUrl: coverUrl
    };
  });

  populateDropdowns();
  applyFilters();
}

function cleanISBN(val) {
  if (!val) return '';
  return String(val).replace(/[^0-9X]/gi, '');
}

function parseReadYear(dateStr) {
  if (!dateStr) return '';
  const match = String(dateStr).match(/\b(19|20)\d{2}\b/);
  return match ? match[0] : '';
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

function getFilterElement(ids) {
  for (const id of ids) {
    const el = document.getElementById(id);
    if (el) return el;
  }
  return null;
}

function populateDropdowns() {
  const yearSelect = getFilterElement(['filter-year-read', 'yearFilter', 'yearReadFilter']);
  if (yearSelect && yearSelect.tagName === 'SELECT') {
    const currentVal = yearSelect.value;
    const years = [...new Set(booksData.map(b => b.readYear).filter(Boolean))].sort((a, b) => b - a);

    yearSelect.innerHTML = '<option value="all">All Years</option>';
    years.forEach(yr => {
      const opt = document.createElement('option');
      opt.value = yr;
      opt.textContent = yr;
      yearSelect.appendChild(opt);
    });

    if (years.includes(currentVal)) {
      yearSelect.value = currentVal;
    }
  }

  renderGenreTags();
}

function renderGenreTags() {
  const container = document.getElementById('genreContainer') || getFilterElement(['filter-genre', 'genreFilter']);
  if (!container) return;

  const genreCounts = {};
  booksData.forEach(book => {
    if (Array.isArray(book.genres)) {
      book.genres.forEach(g => {
        if (!g) return;
        const formatted = g.charAt(0).toUpperCase() + g.slice(1);
        genreCounts[formatted] = (genreCounts[formatted] || 0) + 1;
      });
    }
  });

  const sortedGenres = Object.keys(genreCounts).sort((a, b) => a.localeCompare(b));

  if (container.tagName === 'SELECT') {
    let optionsHTML = `<option value="all">All Genres (${booksData.length})</option>`;
    sortedGenres.forEach(genreName => {
      const count = genreCounts[genreName];
      const isSelected = activeGenre.toLowerCase() === genreName.toLowerCase() ? 'selected' : '';
      optionsHTML += `<option value="${escapeHtml(genreName)}" ${isSelected}>${escapeHtml(genreName)} (${count})</option>`;
    });
    container.innerHTML = optionsHTML;
  } else {
    let buttonsHTML = `
      <button type="button" data-genre="all" class="genre-pill ${activeGenre === 'all' ? 'bg-amber-500 text-black font-semibold' : 'bg-zinc-900 text-zinc-300 border border-zinc-800'} px-3 py-1 rounded-full text-xs transition-colors">
        All (${booksData.length})
      </button>
    `;
    sortedGenres.forEach(genreName => {
      const count = genreCounts[genreName];
      const isActive = activeGenre.toLowerCase() === genreName.toLowerCase();
      buttonsHTML += `
        <button type="button" data-genre="${escapeHtml(genreName)}" class="genre-pill ${isActive ? 'bg-amber-500 text-black font-semibold' : 'bg-zinc-900 text-zinc-300 border border-zinc-800 hover:border-zinc-700'} px-3 py-1 rounded-full text-xs transition-colors">
          ${escapeHtml(genreName)} (${count})
        </button>
      `;
    });
    container.innerHTML = buttonsHTML;
  }
}

function applyFilters() {
  const searchInput = getFilterElement(['search-input', 'searchInput']);
  const shelfFilter = getFilterElement(['filter-status', 'shelfFilter']);
  const ratingFilter = getFilterElement(['filter-rating', 'ratingFilter']);
  const yearFilter = getFilterElement(['filter-year-read', 'yearFilter']);
  const genreFilter = getFilterElement(['filter-genre', 'genreFilter']);
  const sortBySelect = getFilterElement(['sort-select', 'sortBy']);

  const search = searchInput ? searchInput.value.toLowerCase().trim() : '';
  const shelf = shelfFilter ? shelfFilter.value.toLowerCase() : 'all';
  const rating = ratingFilter ? parseFloat(ratingFilter.value) : 0;
  const year = yearFilter ? String(yearFilter.value).trim() : 'all';
  const selectedGenre = genreFilter && genreFilter.tagName === 'SELECT' ? genreFilter.value.toLowerCase() : activeGenre.toLowerCase();
  const sortBy = sortBySelect ? sortBySelect.value : 'title-asc';

  filteredBooks = booksData.filter(b => {
    const matchesSearch = !search || 
      b.title.toLowerCase().includes(search) || 
      b.author.toLowerCase().includes(search);
      
    const matchesShelf = shelf === 'all' || b.shelf === shelf;

    const matchesGenre = selectedGenre === 'all' || (
      Array.isArray(b.genres) && b.genres.some(g => g.toLowerCase() === selectedGenre)
    );

    const matchesRating = rating === 0 || Math.floor(b.myRating) === Math.floor(rating);
    const matchesYear = year === 'all' || year === '' || String(b.readYear) === year;

    return matchesSearch && matchesShelf && matchesGenre && matchesRating && matchesYear;
  });

  filteredBooks.sort((a, b) => {
    if (sortBy === 'rating-desc') return b.myRating - a.myRating;
    if (sortBy === 'rating-asc') return a.myRating - b.myRating;
    if (sortBy === 'pages-desc') return b.pages - a.pages;
    if (sortBy === 'pages-asc') return a.pages - b.pages;
    if (sortBy === 'title-desc') return b.title.localeCompare(a.title);
    if (sortBy === 'shuffle') return Math.random() - 0.5;
    return a.title.localeCompare(b.title);
  });

  updateStatsSummary();
  renderCurrentView();
}

function updateStatsSummary() {
  const countEl = getFilterElement(['book-count', 'bookCount']);
  if (countEl) {
    countEl.textContent = `Showing ${filteredBooks.length} of ${booksData.length} entries`;
  }
}

function renderCurrentView() {
  if (currentView === 'list') {
    renderListView();
  } else if (currentView === 'shelf') {
    renderShelfView();
  } else {
    renderGridCoverView();
  }
}

function renderGridCoverView() {
  const grid = getFilterElement(['view-container']);
  if (!grid) return;

  if (filteredBooks.length === 0) {
    grid.innerHTML = `
      <div class="py-20 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl">
        <p class="text-base font-semibold">No books match your criteria</p>
        <p class="text-xs text-zinc-600 mt-1">Try clearing your filters or check your data source export variable.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = `
    <div class="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
      ${filteredBooks.map(book => {
        const fallbackCover = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450"><rect width="100%" height="100%" fill="#18181b"/><text x="50%" y="50%" fill="#a1a1aa" font-family="sans-serif" font-size="14" text-anchor="middle" dominant-baseline="middle">${escapeHtml(book.title)}</text></svg>`)}`;
        return `
          <div data-book-id="${book.id}" class="book-card group bg-zinc-900 border border-zinc-800 hover:border-zinc-600 rounded-lg overflow-hidden flex flex-col cursor-pointer transition-all shadow-md">
            <div class="aspect-[2/3] w-full bg-zinc-800 relative overflow-hidden">
              <img src="${escapeHtml(book.coverUrl || fallbackCover)}" alt="${escapeHtml(book.title)}" loading="lazy" class="w-full h-full object-cover group-hover:scale-105 transition-transform" onerror="this.onerror=null; this.src='${fallbackCover}'"/>
              ${book.myRating > 0 ? `<div class="absolute top-2 right-2 bg-black/80 backdrop-blur px-2 py-0.5 rounded text-amber-400 font-bold text-xs">★ ${book.myRating.toFixed(1)}</div>` : ''}
            </div>
            <div class="p-3 flex flex-col flex-1 justify-between">
              <div>
                <h3 class="text-white font-semibold text-sm line-clamp-1 group-hover:text-amber-400 transition-colors">${escapeHtml(book.title)}</h3>
                <p class="text-zinc-400 text-xs line-clamp-1 mt-0.5">${escapeHtml(book.author)}</p>
              </div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
  `;

  attachCardClickEvents();
}

function renderListView() {
  const grid = getFilterElement(['view-container']);
  if (!grid) return;

  if (filteredBooks.length === 0) {
    grid.innerHTML = `<div class="py-16 text-center text-zinc-500 border border-dashed border-zinc-800 rounded-xl">No books found.</div>`;
    return;
  }

  grid.innerHTML = `
    <div class="flex flex-col gap-2">
      ${filteredBooks.map(book => `
        <div data-book-id="${book.id}" class="book-card bg-zinc-900 border border-zinc-800 hover:border-zinc-700 p-3 rounded-lg flex items-center justify-between cursor-pointer transition-all">
          <div class="flex items-center gap-4">
            <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" class="w-10 h-14 object-cover rounded bg-zinc-800" />
            <div>
              <h4 class="text-white font-semibold text-sm">${escapeHtml(book.title)}</h4>
              <p class="text-zinc-400 text-xs">${escapeHtml(book.author)}</p>
            </div>
          </div>
          <div class="flex items-center gap-6 text-xs text-zinc-400">
            <span>${book.readYear || '—'}</span>
            <span class="text-amber-400 font-bold">${book.myRating > 0 ? '★ ' + book.myRating : '—'}</span>
          </div>
        </div>
      `).join('')}
    </div>
  `;

  attachCardClickEvents();
}

function renderShelfView() {
  const grid = getFilterElement(['view-container']);
  if (!grid) return;

  grid.innerHTML = `
    <div class="w-full bg-zinc-950 border border-zinc-800 rounded-2xl p-6 shadow-2xl">
      <div class="text-xs text-zinc-400 mb-4 flex items-center justify-between">
        <span>📚 Shelf View</span>
        <span class="text-zinc-500">${filteredBooks.length} Books</span>
      </div>
      <div class="flex items-end justify-start gap-1 overflow-x-auto min-h-[300px] pt-10 pb-2 px-4 bg-zinc-900/40 rounded-xl border border-zinc-800">
        ${filteredBooks.map(book => {
          const width = Math.max(Math.min((book.pages || 200) / 8, 56), 32);
          const height = Math.max(Math.min((book.pages || 200) / 3 + 160, 260), 200);
          return `
            <div data-book-id="${book.id}" class="book-card flex-shrink-0 cursor-pointer transition-transform hover:-translate-y-4" style="width: ${width}px; height: ${height}px; background-color: #27272a; border: 1px solid #3f3f46; border-radius: 4px; display: flex; align-items: center; justify-content: center; padding: 4px;">
              <span style="writing-mode: vertical-rl; transform: rotate(180deg); color: #f43f5e; font-size: 10px; font-weight: bold; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-height: ${height - 20}px;">${escapeHtml(book.title)}</span>
            </div>
          `;
        }).join('')}
      </div>
    </div>
  `;

  attachCardClickEvents();
}

function attachCardClickEvents() {
  document.querySelectorAll('.book-card').forEach(card => {
    card.addEventListener('click', () => {
      const bookId = card.getAttribute('data-book-id');
      if (bookId) openBookModal(bookId);
    });
  });
}

function openBookModal(bookId) {
  const book = booksData.find(b => String(b.id) === String(bookId));
  if (!book) return;

  let modal = document.getElementById('book-modal');
  if (!modal) {
    modal = document.createElement('div');
    modal.id = 'book-modal';
    modal.className = 'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4';
    document.body.appendChild(modal);
  }

  modal.innerHTML = `
    <div class="bg-zinc-900 border border-zinc-800 w-full max-w-xl rounded-xl p-6 relative flex flex-col sm:flex-row gap-6 shadow-2xl text-zinc-100">
      <button id="close-modal" class="absolute top-4 right-4 text-zinc-400 hover:text-white text-lg font-bold">✕</button>
      <img src="${escapeHtml(book.coverUrl)}" alt="${escapeHtml(book.title)}" class="w-36 h-52 object-cover rounded-lg bg-zinc-800 shadow-md shrink-0" />
      <div class="flex flex-col justify-between flex-1">
        <div>
          <h2 class="text-xl font-bold text-white">${escapeHtml(book.title)}</h2>
          <p class="text-amber-400 text-sm font-medium mt-1">${escapeHtml(book.author)}</p>
          <div class="flex items-center gap-3 mt-3 text-xs text-zinc-400">
            <span>Rating: <strong class="text-white">${book.myRating ? '★ ' + book.myRating : 'N/A'}</strong></span>
            <span>Pages: <strong class="text-white">${book.pages || 'N/A'}</strong></span>
            <span>Read: <strong class="text-white">${book.dateRead || book.readYear || 'N/A'}</strong></span>
          </div>
          ${book.genres.length > 0 ? `
            <div class="mt-3 flex flex-wrap gap-1">
              ${book.genres.map(g => `<span class="bg-zinc-800 text-zinc-300 text-[10px] px-2 py-0.5 rounded-full">${escapeHtml(g)}</span>`).join('')}
            </div>
          ` : ''}
          ${book.myReview ? `<p class="mt-4 text-xs text-zinc-300 leading-relaxed max-h-32 overflow-y-auto pr-2 border-t border-zinc-800 pt-3">${escapeHtml(book.myReview)}</p>` : ''}
        </div>
      </div>
    </div>
  `;

  modal.classList.remove('hidden');
  document.getElementById('close-modal').addEventListener('click', () => modal.remove());
  modal.addEventListener('click', (e) => {
    if (e.target === modal) modal.remove();
  });
}

function setupEventListeners() {
  const filterInputs = [
    getFilterElement(['search-input', 'searchInput']),
    getFilterElement(['filter-status', 'shelfFilter']),
    getFilterElement(['filter-rating', 'ratingFilter']),
    getFilterElement(['filter-year-read', 'yearFilter']),
    getFilterElement(['filter-genre']),
    getFilterElement(['sort-select', 'sortBy'])
  ];

  filterInputs.forEach(el => {
    if (!el) return;
    el.addEventListener('change', applyFilters);
    el.addEventListener('input', applyFilters);
  });

  const btnGrid = getFilterElement(['view-grid-btn', 'btn-grid']);
  const btnList = getFilterElement(['view-list-btn', 'btn-list']);
  const btnShelf = getFilterElement(['view-shelf-btn', 'view-3d-btn', 'btn-shelf']);

  if (btnGrid) btnGrid.addEventListener('click', () => { currentView = 'grid'; updateViewButtonStyles(btnGrid); applyFilters(); });
  if (btnList) btnList.addEventListener('click', () => { currentView = 'list'; updateViewButtonStyles(btnList); applyFilters(); });
  if (btnShelf) btnShelf.addEventListener('click', () => { currentView = 'shelf'; updateViewButtonStyles(btnShelf); applyFilters(); });

  const genreContainer = document.getElementById('genreContainer');
  if (genreContainer) {
    genreContainer.addEventListener('click', (e) => {
      const pill = e.target.closest('[data-genre]');
      if (pill) {
        activeGenre = pill.getAttribute('data-genre');
        renderGenreTags();
        applyFilters();
      }
    });
  }
}

function updateViewButtonStyles(activeBtn) {
  const btns = [document.getElementById('view-grid-btn'), document.getElementById('view-list-btn'), document.getElementById('view-shelf-btn') || document.getElementById('view-3d-btn')];
  btns.forEach(btn => {
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

function setupModalListeners() {
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      const modal = document.getElementById('book-modal');
      if (modal) modal.remove();
    }
  });
}

function initializeTheme() {
  document.documentElement.classList.add('dark');
}
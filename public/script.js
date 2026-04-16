// Tailwind konfiguráció (ha szükséges)
function initTailwind() {
    if (typeof tailwind !== 'undefined') {
        tailwind.config = {
            content: [],
            theme: { extend: {} }
        };
    }
}

// Mobil menü
function toggleMobileMenu() {
    const menu = document.getElementById('mobileMenu');
    if (menu) menu.classList.toggle('hidden');
}

function escapeHtml(str) {
    if (!str) return '';
    return str.replace(/[&<>]/g, m => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[m] || m));
}

// ========== AUTO-HIDE HEADER ==========
let lastScroll = 0;
const header = document.querySelector('nav');
if (header) {
    header.style.transition = 'transform 0.3s ease';
    window.addEventListener('scroll', () => {
        const current = window.scrollY;
        if (current > 80 && current > lastScroll) {
            header.style.transform = 'translateY(-100%)';
        } else if (current < lastScroll || current <= 10) {
            header.style.transform = 'translateY(0)';
        }
        if (current > 50) header.classList.add('scrolled');
        else header.classList.remove('scrolled');
        lastScroll = current;
    });
}

// (Nav scrolled state handled in optimized scroll handler below)

// ========== VÉLEMÉNYEK RENDSZER - TELJESEN MŰKÖDŐ VERZIÓ ==========
let allReviews = [];
let showAll = false;

// Csillagok megjelenítése
function renderStars(rating) {
    let stars = '';
    for (let i = 1; i <= 5; i++) {
        stars += i <= rating ? '★' : '☆';
    }
    return stars;
}

// Vélemény kártya HTML
function createReviewCard(review) {
    return `
        <div class="bg-gray-50 rounded-2xl p-6 shadow-md hover:shadow-lg transition-all">
            <div class="text-yellow-500 text-2xl mb-3">${renderStars(review.stars)}</div>
            <p class="text-gray-700 italic mb-4">"${escapeHtml(review.text)}"</p>
            <div class="border-t pt-3">
                <div class="font-bold text-teal-700">${escapeHtml(review.name)}</div>
                <div class="text-sm text-gray-500">${escapeHtml(review.service)} • ${review.date}</div>
            </div>
        </div>
    `;
}

// Statisztika frissítése a frontenden (a betöltött vélemények alapján)
function updateStats() {
    const totalEl = document.getElementById('totalReviewsDisplay');
    const avgEl = document.getElementById('avgRatingDisplay');
    if (totalEl) totalEl.textContent = allReviews.length;
    if (avgEl && allReviews.length > 0) {
        const avg = allReviews.reduce((sum, r) => sum + r.stars, 0) / allReviews.length;
        avgEl.textContent = avg.toFixed(1);
    } else if (avgEl) {
        avgEl.textContent = '0.0';
    }
}

// Vélemények betöltése a backendről
async function loadReviews() {
    try {
        const response = await fetch('/api/reviews');
        if (!response.ok) throw new Error('Network error');
        allReviews = await response.json();
        console.log('Betöltött vélemények:', allReviews.length);
        displayReviews();
        updateStats();   // FRISSÍTI A DARABSZÁMOT ÉS AZ ÁTLAGOT
    } catch (error) {
        console.error('Load error:', error);
        allReviews = [];
        displayReviews();
        updateStats();   // nullázza a statisztikát hiba esetén
    }
}

// Vélemények megjelenítése (6 vagy összes)
function displayReviews() {
    const container = document.getElementById('allReviewsContainer');
    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (!container) return;

    if (showAll) {
        container.innerHTML = allReviews.map(createReviewCard).join('');
        if (loadMoreBtn) {
            loadMoreBtn.textContent = 'Kevesebb vélemény mutatása';
            loadMoreBtn.classList.remove('hidden');
        }
    } else {
        const toShow = allReviews.slice(0, 8);
        container.innerHTML = toShow.map(createReviewCard).join('');
        if (loadMoreBtn) {
            if (allReviews.length > 8) {
                loadMoreBtn.textContent = `További vélemények mutatása (${allReviews.length - 8} db)`;
                loadMoreBtn.classList.remove('hidden');
            } else {
                loadMoreBtn.classList.add('hidden');
            }
        }
    }
}

// Több/kevesebb vélemény mutatása
function toggleReviews() {
    showAll = !showAll;
    displayReviews();
}

// Új vélemény küldése a backendre
async function submitReview(review) {
    try {
        const response = await fetch('/api/reviews', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(review)
        });
        if (response.ok) {
            await loadReviews(); // újratölti a listát és frissíti a statisztikát
            return true;
        }
        return false;
    } catch (error) {
        console.error('Submit error:', error);
        return false;
    }
}

// Csillagok kezelése az űrlapban
function initStars() {
    const stars = document.querySelectorAll('#starRating .star');
    const hidden = document.getElementById('reviewStars');
    if (!stars.length) return;

    function setStars(rating) {
        stars.forEach(star => {
            const val = parseInt(star.getAttribute('data-value'));
            star.style.color = val <= rating ? '#f59e0b' : '#d1d5db';
        });
        if (hidden) hidden.value = rating;
    }

    stars.forEach(star => {
        star.addEventListener('click', () => setStars(parseInt(star.getAttribute('data-value'))));
        star.addEventListener('mouseover', () => {
            const rating = parseInt(star.getAttribute('data-value'));
            stars.forEach(s => {
                const val = parseInt(s.getAttribute('data-value'));
                s.style.color = val <= rating ? '#f59e0b' : '#d1d5db';
            });
        });
        star.addEventListener('mouseout', () => setStars(parseInt(hidden.value)));
    });
    setStars(5);
}

// Vélemény űrlap beküldésének eseménykezelője
function initReviewEvents() {
    const form = document.getElementById('reviewForm');
    if (form) {
        form.addEventListener('submit', async (e) => {
            e.preventDefault();
            const name = document.getElementById('reviewName').value.trim();
            const service = document.getElementById('reviewService').value;
            const stars = parseInt(document.getElementById('reviewStars').value);
            const text = document.getElementById('reviewText').value.trim();

            if (!name || !text) {
                alert('Kérlek add meg a neved és a véleményed!');
                return;
            }

            const success = await submitReview({
                name: name,
                service: service || 'Egyéb',
                stars: stars,
                text: text
            });

            if (success) {
                form.reset();
                document.getElementById('reviewStars').value = 5;
                document.querySelectorAll('#starRating .star').forEach(s => s.style.color = '#f59e0b');
                showAll = false;
                alert('Köszönjük a véleményedet!');
                document.getElementById('ertekelesek').scrollIntoView({ behavior: 'smooth' });
            } else {
                alert('Hiba történt, próbáld újra!');
            }
        });
    }

    const loadMoreBtn = document.getElementById('loadMoreBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', toggleReviews);
    }
}

// ========== GALÉRIA (6 kép + További gomb) ==========
let allGalleryImages = [];
let galleryShowAll = false;

async function loadGallery() {
    try {
        const response = await fetch('/api/gallery');
        allGalleryImages = await response.json();
        const container = document.getElementById('galleryGrid');
        if (!container) return;
        
        if (allGalleryImages.length === 0) {
            container.innerHTML = '<div class="col-span-full text-center text-gray-500">Még nincsenek feltöltött képek.</div>';
            return;
        }
        
        displayGallery();
    } catch (error) {
        console.error('Hiba a galéria betöltésekor:', error);
    }
}

function displayGallery() {
    const container = document.getElementById('galleryGrid');
    const loadMoreBtn = document.getElementById('loadMoreGalleryBtn');
    if (!container) return;
    
    // Ellenőrizzük, hogy a válasz string (fájlrendszer) vagy objektum (Cloudinary)
    const isCloudinary = allGalleryImages.length > 0 && typeof allGalleryImages[0] === 'object';
    
    let imagesToShow;
    if (galleryShowAll) {
        imagesToShow = allGalleryImages;
        if (loadMoreBtn) loadMoreBtn.textContent = 'Kevesebb kép mutatása';
    } else {
        imagesToShow = allGalleryImages.slice(0, 6);
        if (loadMoreBtn && allGalleryImages.length > 6) {
            loadMoreBtn.textContent = `További képek mutatása (${allGalleryImages.length - 6} db)`;
            loadMoreBtn.classList.remove('hidden');
        } else if (loadMoreBtn) {
            loadMoreBtn.classList.add('hidden');
        }
    }
    
    if (isCloudinary) {
        container.innerHTML = imagesToShow.map(img => `
            <div class="group rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer" onclick="openModal('${img.url}')">
                <div class="relative overflow-hidden aspect-square">
                    <img src="${img.url}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="galéria kép">
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                        <i class="fa-solid fa-magnifying-glass-plus text-white text-3xl opacity-0 group-hover:opacity-100 transition"></i>
                    </div>
                </div>
            </div>
        `).join('');
    } else {
        container.innerHTML = imagesToShow.map(img => `
            <div class="group rounded-2xl overflow-hidden shadow-lg hover:shadow-2xl transition-all duration-300 cursor-pointer" onclick="openModal('/gallery/${img}')">
                <div class="relative overflow-hidden aspect-square">
                    <img src="/gallery/${img}" class="w-full h-full object-cover transition-transform duration-500 group-hover:scale-110" alt="galéria kép">
                    <div class="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition-all flex items-center justify-center">
                        <i class="fa-solid fa-magnifying-glass-plus text-white text-3xl opacity-0 group-hover:opacity-100 transition"></i>
                    </div>
                </div>
            </div>
        `).join('');
    }
}

function toggleGallery() {
    galleryShowAll = !galleryShowAll;
    displayGallery();
}

// Eseménykezelő a gombhoz (ha a DOMContentLoaded már van, akkor ezt a részt told bele)
// Ha nincs másik DOMContentLoaded, akkor ezt add hozzá:
document.addEventListener('DOMContentLoaded', () => {
    const loadMoreBtn = document.getElementById('loadMoreGalleryBtn');
    if (loadMoreBtn) {
        loadMoreBtn.addEventListener('click', toggleGallery);
    }
});
function openModal(src) {
    const modal = document.getElementById('imageModal');
    const modalImg = document.getElementById('modalImage');
    modalImg.src = src;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    document.body.style.overflow = 'hidden';
}

function closeModal() {
    const modal = document.getElementById('imageModal');
    modal.classList.add('hidden');
    modal.classList.remove('flex');
    document.body.style.overflow = 'auto';
}

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeModal();
});

// Vélemények indítása
loadReviews();
initStars();
initReviewEvents();
loadGallery();

// ========== KAPCSOLAT ŰRLAP KEZELÉSE (saját backend) ==========
const contactForm = document.getElementById('contactForm');
if (contactForm) {
    contactForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        e.stopPropagation();

        const btn = document.getElementById('contactSubmitBtn');
        const status = document.getElementById('contactStatus');
        const originalText = btn.textContent;

        btn.disabled = true;
        btn.textContent = 'Küldés...';

        const formData = {
            name: document.getElementById('contactName').value,
            phone: document.getElementById('contactPhone').value,
            email: document.getElementById('contactEmail').value,
            message: document.getElementById('contactMessage').value
        };

        try {
            // Saját backend API hívás
            const response = await fetch('/api/contact', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(formData)
            });

            const result = await response.json();

            if (result.success) {
                status.innerHTML = '<div class="bg-green-100 text-green-700 p-3 rounded-2xl">✅ Üzenet elküldve! Hamarosan jelentkezünk.</div>';
                contactForm.reset();
            } else {
                status.innerHTML = `<div class="bg-red-100 text-red-700 p-3 rounded-2xl">❌ Hiba: ${result.message || 'Próbáld újra!'}</div>`;
            }
        } catch (error) {
            console.error('Hiba:', error);
            status.innerHTML = '<div class="bg-red-100 text-red-700 p-3 rounded-2xl">❌ Hiba történt. Próbáld újra!</div>';
        }

        status.classList.remove('hidden');
        btn.disabled = false;
        btn.textContent = originalText;

        setTimeout(() => {
            status.classList.add('hidden');
        }, 5000);
    });
}


console.log('%c✅ Balogh Szerkezet weboldal – Backenddel működik!', 'background:#0f766e;color:#fff;padding:6px 12px;border-radius:9999px;');

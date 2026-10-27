// v2 — single entry point. Vanilla, no dependencies.

const REDUCED = matchMedia('(prefers-reduced-motion: reduce)').matches;
const INK = [236, 235, 230];
const RED = [244, 0, 73];
const BG = [6, 6, 7];

const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5].map(v => (v + .5) / 16);

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------------------------------------------------------------- HUD

function hud()
{
	const header = $('.hud');
	const clock = $('#clock');
	const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/Paris', hour: '2-digit', minute: '2-digit', second: '2-digit' });
	const tick = () => clock.textContent = fmt.format(new Date());
	tick();
	setInterval(tick, 1000);

	const onScroll = () => header.classList.toggle('solid', scrollY > 40);
	addEventListener('scroll', onScroll, { passive: true });
	onScroll();

	const btn = $('#menu-btn');
	const nav = $('#nav');
	btn.addEventListener('click', () =>
	{
		const open = nav.classList.toggle('open');
		btn.setAttribute('aria-expanded', open);
		document.body.style.overflow = open ? 'hidden' : '';
	});
	$$('a', nav).forEach(a => a.addEventListener('click', () =>
	{
		nav.classList.remove('open');
		btn.setAttribute('aria-expanded', false);
		document.body.style.overflow = '';
	}));

	const links = Object.fromEntries($$('a', nav).map(a => [a.getAttribute('href').slice(1), a]));
	const spy = new IntersectionObserver(entries =>
	{
		for (const e of entries)
			if (e.isIntersecting)
			{
				Object.values(links).forEach(a => a.classList.remove('active'));
				links[e.target.id]?.classList.add('active');
			}
	}, { rootMargin: '-45% 0px -50% 0px' });
	$$('.sec').forEach(s => spy.observe(s));
}

// ---------------------------------------------------------------- reveal

const revealer = new IntersectionObserver(entries =>
{
	for (const e of entries)
		if (e.isIntersecting)
		{
			e.target.classList.add(e.target.classList.contains('sec') ? 'seen' : 'in');
			revealer.unobserve(e.target);
		}
}, { threshold: .15 });

function reveal(root = document)
{
	$$('.reveal, .sec', root).forEach(el => revealer.observe(el));
}

// ---------------------------------------------------------------- text scramble

function scramble(el, delay = 0)
{
	const target = el.textContent;
	if (REDUCED) return;
	const glyphs = '!<>-_\\/[]{}=+*^?#01';
	let frame = 0;
	const total = 10 + target.length * 3;
	setTimeout(function step()
	{
		el.textContent = [...target].map((ch, i) =>
		{
			const lock = 10 + i * 3;
			if (frame >= lock) return ch;
			return glyphs[(Math.random() * glyphs.length) | 0];
		}).join('');
		if (++frame <= total) requestAnimationFrame(step);
	}, delay);
}

// ---------------------------------------------------------------- hero field (dithered noise)

function makeNoise(seed = 1337)
{
	const p = new Uint8Array(512);
	const perm = [...Array(256).keys()];
	for (let i = 255; i > 0; i--)
	{
		seed = (seed * 16807) % 2147483647;
		const j = seed % (i + 1);
		[perm[i], perm[j]] = [perm[j], perm[i]];
	}
	for (let i = 0; i < 512; i++) p[i] = perm[i & 255];
	const fade = t => t * t * (3 - 2 * t);
	const h = (x, y) => p[p[x & 255] + (y & 255)] / 255;
	return (x, y) =>
	{
		const xi = Math.floor(x), yi = Math.floor(y);
		const u = fade(x - xi), v = fade(y - yi);
		const a = h(xi, yi), b = h(xi + 1, yi), c = h(xi, yi + 1), d = h(xi + 1, yi + 1);
		return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
	};
}

function field()
{
	const canvas = $('#field');
	const ctx = canvas.getContext('2d');
	const noise = makeNoise();
	const PX = 5;
	let w, h, img, buf, t = 0, visible = true, last = 0;
	const mouse = { x: -1e3, y: -1e3, tx: -1e3, ty: -1e3 };

	const pack = ([r, g, b]) => (255 << 24) | (b << 16) | (g << 8) | r;
	const C_BG = 0, C_RED = pack(RED), C_INK = pack(INK), C_DEEP = pack([120, 0, 36]);

	function resize()
	{
		w = Math.ceil(canvas.clientWidth / PX);
		h = Math.ceil(canvas.clientHeight / PX);
		canvas.width = w;
		canvas.height = h;
		img = ctx.createImageData(w, h);
		buf = new Uint32Array(img.data.buffer);
	}

	function loop(now)
	{
		requestAnimationFrame(loop);
		if (!visible || now - last < 33) return;
		last = now;
		t += .006;
		draw();
	}

	function draw()
	{
		mouse.x += (mouse.tx - mouse.x) * .08;
		mouse.y += (mouse.ty - mouse.y) * .08;

		const mx = mouse.x / PX, my = mouse.y / PX, mr = 1 / (w * w * .012);
		for (let y = 0; y < h; y++)
		{
			const ny = y * .028;
			for (let x = 0; x < w; x++)
			{
				const nx = x * .018;
				// domain-warped fbm — reads like ink spreading on paper
				const q = noise(nx + t, ny - t * .6);
				let v = noise(nx * 1.0 + q * 2.2, ny + q * 1.6 + t * .4) * .65
				      + noise(nx * 2.7 - t, ny * 2.7) * .35;
				// bias toward the right side, away from the headline
				v += (x / w - .62) * .5;
				const dx = x - mx, dy = y - my;
				v += Math.max(0, .45 - (dx * dx + dy * dy) * mr);

				const th = BAYER4[(y & 3) * 4 + (x & 3)];
				const i = y * w + x;
				if (v > .86 + th * .16) buf[i] = C_INK;
				else if (v > .62 + th * .22) buf[i] = C_RED;
				else if (v > .5 + th * .2 && ((x + y) & 1)) buf[i] = C_DEEP;
				else buf[i] = C_BG;
			}
		}
		ctx.putImageData(img, 0, 0);
	}

	resize();
	addEventListener('resize', () => { resize(); if (REDUCED) draw(); });
	addEventListener('pointermove', e =>
	{
		const r = canvas.getBoundingClientRect();
		mouse.tx = e.clientX - r.left;
		mouse.ty = e.clientY - r.top;
	}, { passive: true });
	new IntersectionObserver(([e]) => visible = e.isIntersecting).observe(canvas);

	if (REDUCED) draw();
	else requestAnimationFrame(loop);
}

// ---------------------------------------------------------------- portrait dither

function portrait()
{
	const src = $('#portrait-src');
	const canvas = $('#portrait-dither');
	const S = 200;

	const run = () =>
	{
		canvas.width = canvas.height = S;
		const ctx = canvas.getContext('2d', { willReadFrequently: true });
		ctx.drawImage(src, 0, 0, S, S);
		let data;
		try { data = ctx.getImageData(0, 0, S, S); }
		catch { canvas.remove(); src.style.opacity = 1; return; } // tainted (file://)

		const d = data.data;
		for (let y = 0; y < S; y++)
			for (let x = 0; x < S; x++)
			{
				const i = (y * S + x) * 4;
				const a = d[i + 3] / 255;
				let l = (d[i] * .299 + d[i + 1] * .587 + d[i + 2] * .114) / 255;
				l = Math.min(1, Math.max(0, (l - .5) * 1.45 + .55)) * a;
				const th = BAYER4[(y & 3) * 4 + (x & 3)];
				let c = BG, alpha = 255;
				if (a < .1) { c = ((x ^ y) & 7) === 0 ? [40, 40, 42] : BG; }
				else if (l > .3 + th * .55) c = INK;
				else if (l > .08 + th * .3) c = RED;
				[d[i], d[i + 1], d[i + 2], d[i + 3]] = [...c, alpha];
			}
		ctx.putImageData(data, 0, 0);
	};

	if (src.complete && src.naturalWidth) run();
	else src.addEventListener('load', run, { once: true });
}

// ---------------------------------------------------------------- data

const json = url => fetch(url).then(r => r.json());
const pad = n => String(n).padStart(2, '0');
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);

const videoObserver = new IntersectionObserver(entries =>
{
	for (const e of entries)
		e.isIntersecting ? e.target.play().catch(() => {}) : e.target.pause();
}, { threshold: .2, rootMargin: '200px 0px' });

function watchVideos(root)
{
	$$('video', root).forEach(v => videoObserver.observe(v));
}

function screen(video, label)
{
	return `
		<div class="screen" data-label="${esc(label)}">
			<video src="${esc(video)}" poster="${esc(video.replace(/\.mp4$/, '.poster.webp'))}" muted loop playsinline preload="none"></video>
			<span class="rec"><span class="dot"></span>REC</span>
		</div>`;
}

function still(image, label, alt)
{
	return `
		<div class="screen" data-label="${esc(label)}">
			<img src="${esc(image)}" alt="${esc(alt)}" width="1280" height="720" loading="lazy" decoding="async"/>
		</div>`;
}

// textured stand-in for entries without footage
function placeholder(title, note)
{
	return `
		<div class="screen blank" data-label="${esc(note)}">
			<span class="blank-title">${esc(title)}</span>
		</div>`;
}

function link(href, text, cls = '')
{
	return href && href !== 'none'
		? `<a class="${cls}" href="${esc(href)}" target="_blank" rel="noopener">${text}</a>`
		: text;
}

async function projects()
{
	const { projects } = await json('resources/jsons/projects.json');
	projects.sort((a, b) => b.date - a.date);
	const list = $('#project-list');

	function render(filter)
	{
		const items = projects.filter(p => filter === 'All' || p.categories.includes(filter));
		$('#proj-count').textContent = `/${pad(items.length)} entries`;

		if (!items.length)
		{
			list.innerHTML = `<div class="proj"><span class="mono dim">// no ${esc(filter.toLowerCase())} entries yet — coming soon</span></div>`;
			return;
		}

		list.innerHTML = items.map((p, i) =>
		{
			const type = Array.isArray(p.type) ? p.type[0] : p.type;
			const [site, code, demo] = p.links;
			return `
			<article class="proj reveal">
				<span class="n">${pad(i + 1)}</span>
				<div class="proj-info">
					<div class="proj-meta mono">
						${p.logo ? `<img src="${esc(p.logo)}" alt="" width="28" height="28" loading="lazy" decoding="async"/>` : ''}
						<span>${esc(p.date)}</span><span>—</span><span>${esc(type)}</span>
					</div>
					<h3>${link(site, esc(p.title))}</h3>
					<p>${esc(p.description)}</p>
					<div class="proj-links">
						${code && code !== 'none' ? `<a href="${esc(code)}" target="_blank" rel="noopener">↗ Source</a>` : ''}
						${demo && demo !== 'none' ? `<a href="${esc(demo)}" target="_blank" rel="noopener">↗ Live site</a>` : ''}
					</div>
					<div class="tags">${p.tags.map(t => `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a>`).join('')}</div>
				</div>
				${p.video
					? screen(p.video, `${p.title.toUpperCase().replace(/\s+/g, '_')}.MP4`)
					: p.image
						? still(p.image, p.image.split('/').pop().toUpperCase(), `${p.title} screenshot`)
						: placeholder(p.title, p.status || 'NO SIGNAL — PREVIEW SOON')}
			</article>`;
		}).join('');

		reveal(list);
		watchVideos(list);
	}

	$$('#filters button').forEach(b => b.addEventListener('click', () =>
	{
		$$('#filters button').forEach(x => x.classList.toggle('on', x === b));
		render(b.dataset.f);
	}));
	render('All');
}

async function skills()
{
	const { skills_categories } = await json('resources/jsons/skills.json');
	const list = $('#skill-list');
	list.innerHTML = skills_categories.map((cat, i) => `
		<div class="skill-cat reveal" style="transition-delay:${i * 70}ms">
			<h3>${esc(cat.name)}<span>${pad(cat.skills.length)}</span></h3>
			<ul>
				${cat.skills.map(s => `
					<li><a href="${esc(s.link)}" target="_blank" rel="noopener">
						<img src="${esc(s.logo)}" alt="" width="20" height="20" loading="lazy" decoding="async"/>${esc(s.name)}
					</a></li>`).join('')}
			</ul>
			<div class="bars" aria-hidden="true">${cat.skills.map((_, j) => `<i style="height:${6 + ((j * 7 + i * 5) % 16)}px"></i>`).join('')}</div>
		</div>`).join('');
	reveal(list);
}

async function experience()
{
	const { experience } = await json('resources/jsons/experience.json');
	const list = $('#exp-list');
	const ym = s => s.replace('-', '.');
	list.innerHTML = experience.map(x => `
		<article class="exp reveal">
			<div class="when">${ym(x.start)} → ${x.end ? ym(x.end) : 'now'}<big>${esc(x.start.slice(0, 4))}</big>${esc(x.location || '')}</div>
			<div>
				<h3>${link(x.link, esc(x.title), 'ul')}</h3>
				<span class="type mono">${esc(x.type)}</span>
				<p>${esc(x.description)}</p>
				${x.points ? `<ul class="points">${x.points.map(pt => `<li><b>${esc(pt[0])}</b> ${esc(pt[1])}</li>`).join('')}</ul>` : ''}
				<div class="tags">${x.tags.map(t => `<a href="${esc(t.url)}" target="_blank" rel="noopener">${esc(t.name)}</a>`).join('')}</div>
			</div>
			${x.video
				? screen(x.video, 'INTRO.MP4')
				: x.image
					? still(x.image, x.image.split('/').pop().toUpperCase(), x.title)
					: placeholder(x.title, x.type.toUpperCase())}
		</article>`).join('');
	reveal(list);
	watchVideos(list);
}

// ---------------------------------------------------------------- age

function age()
{
	const BIRTH = { y: 2003, m: 4, d: 6 };
	const now = new Date();
	const m = now.getMonth() + 1;
	const years = now.getFullYear() - BIRTH.y - (m < BIRTH.m || (m === BIRTH.m && now.getDate() < BIRTH.d) ? 1 : 0);
	$$('[data-age]').forEach(el => el.textContent = years);
}

// ---------------------------------------------------------------- boot

age();
hud();
reveal();
field();
portrait();
$$('[data-scramble]').forEach((el, i) => scramble(el, 200 + i * 260));
projects().catch(console.error);
skills().catch(console.error);
experience().catch(console.error);

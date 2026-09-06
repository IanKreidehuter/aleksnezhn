/* ==========================================
   Adrian Aditya — Liquid Glass Profile
========================================== */

const glow = document.querySelector(".cursor-glow");
const card = document.querySelector(".profile-card");

/* ==========================
   Mouse Glow
========================== */

document.addEventListener("mousemove", (e) => {

    glow.style.left = e.clientX + "px";
    glow.style.top = e.clientY + "px";

});

/* ==========================
   Card Tilt
========================== */

document.addEventListener("mousemove", (e) => {

    if (window.innerWidth < 768) return;

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY = ((x / rect.width) - 0.5) * 8;
    const rotateX = ((0.5 - y / rect.height)) * 8;

    card.style.transform = `
        perspective(1400px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        translateY(-4px)
    `;

});

card.addEventListener("mouseleave", () => {

    card.style.transform = `
        perspective(1400px)
        rotateX(0deg)
        rotateY(0deg)
        translateY(0px)
    `;

});

/* ==========================
   Status Pill — cycling text
========================== */

const statusMessages = [
    "nice to meet you !",
    "currently wandering ✦",
    "say hi anytime 💬",
    "tap a card below ↓"
];

const statusEl = document.getElementById("statusText");
let statusIndex = 0;

function cycleStatus() {

    statusEl.animate(
        [{ opacity: 1, transform: "translateY(0)" }, { opacity: 0, transform: "translateY(-6px)" }],
        { duration: 260, easing: "ease", fill: "forwards" }
    ).onfinish = () => {

        statusIndex = (statusIndex + 1) % statusMessages.length;
        statusEl.textContent = statusMessages[statusIndex];

        statusEl.animate(
            [{ opacity: 0, transform: "translateY(6px)" }, { opacity: 1, transform: "translateY(0)" }],
            { duration: 260, easing: "ease", fill: "forwards" }
        );

    };

}

if (statusEl) {

    setInterval(cycleStatus, 3600);

}

/* ==========================
   Window Buttons
========================== */

const folderBtn = document.getElementById("folderBtn");
const closeBtn = document.getElementById("closeBtn");
const aboutAnchor = document.getElementById("aboutAnchor");

if (folderBtn && aboutAnchor) {

    folderBtn.addEventListener("click", () => {

        aboutAnchor.scrollIntoView({ behavior: "smooth", block: "center" });

        aboutAnchor.animate(
            [{ boxShadow: "0 0 0 0 rgba(153,195,228,.6)" }, { boxShadow: "0 0 0 14px rgba(153,195,228,0)" }],
            { duration: 700, easing: "ease-out" }
        );

    });

}

if (closeBtn) {

    closeBtn.addEventListener("click", (e) => {

        for (let i = 0; i < 6; i++) {

            const heart = document.createElement("span");

            heart.textContent = "♡";

            heart.style.position = "fixed";
            heart.style.left = e.clientX + "px";
            heart.style.top = e.clientY + "px";
            heart.style.fontSize = 14 + Math.random() * 10 + "px";
            heart.style.color = "#99C3E4";
            heart.style.pointerEvents = "none";
            heart.style.zIndex = 1000;

            document.body.appendChild(heart);

            const angle = Math.random() * Math.PI * 2;
            const distance = 40 + Math.random() * 40;

            heart.animate([
                { transform: "translate(0,0)", opacity: 1 },
                {
                    transform: `translate(${Math.cos(angle) * distance}px, ${Math.sin(angle) * distance - 30}px)`,
                    opacity: 0
                }
            ], { duration: 900, easing: "ease-out" }).onfinish = () => heart.remove();

        }

    });

}

/* ==========================
   Nav Pill press feedback
========================== */

document.querySelectorAll(".nav-pill").forEach((pill) => {

    pill.addEventListener("pointerdown", () => {

        pill.style.transition = "transform .15s ease";

    });

});

/* ==========================
   Social icon lift
========================== */

document.querySelectorAll(".glass-btn").forEach((btn) => {

    btn.addEventListener("mouseenter", () => {

        btn.style.transform = "translateY(-5px) scale(1.02)";

    });

    btn.addEventListener("mouseleave", () => {

        btn.style.transform = "";

    });

});

/* ==========================
   Scroll Reveal
========================== */

const observer = new IntersectionObserver((entries) => {

    entries.forEach((entry) => {

        if (entry.isIntersecting) {

            entry.target.animate([
                { opacity: 0, transform: "translateY(30px)" },
                { opacity: 1, transform: "translateY(0)" }
            ], { duration: 700, easing: "ease", fill: "forwards" });

        }

    });

}, { threshold: .2 });

document.querySelectorAll(
    ".glass-panel, .nav-pill, .id-panel, .glass-btn"
).forEach((el) => {

    observer.observe(el);

});

/* ==========================
   Floating Background
========================== */

const blobs = document.querySelectorAll(".blob");

window.addEventListener("mousemove", (e) => {

    const x = (e.clientX / window.innerWidth - .5);
    const y = (e.clientY / window.innerHeight - .5);

    blobs.forEach((blob, index) => {

        const speed = (index + 1) * 12;

        blob.style.transform = `translate(${x * speed}px, ${y * speed}px)`;

    });

});

/* ==========================
   Mobile Fix
========================== */

if ("ontouchstart" in window) {

    glow.style.display = "none";

}

/* ==========================
   Smooth Load
========================== */

window.addEventListener("load", () => {

    card.animate([
        { opacity: 0, transform: "translateY(40px) scale(.96)" },
        { opacity: 1, transform: "translateY(0) scale(1)" }
    ], { duration: 900, easing: "cubic-bezier(.22,1,.36,1)", fill: "forwards" });

});

/* ==========================================
   Adrian Aditya
   Liquid Glass Profile
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

    if(window.innerWidth < 768) return;

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    const rotateY =
        ((x / rect.width) - 0.5) * 14;

    const rotateX =
        ((0.5 - y / rect.height)) * 14;

    card.style.transform = `
        perspective(1200px)
        rotateX(${rotateX}deg)
        rotateY(${rotateY}deg)
        translateY(-5px)
    `;

});

card.addEventListener("mouseleave", () => {

    card.style.transform = `
        perspective(1200px)
        rotateX(0deg)
        rotateY(0deg)
        translateY(0px)
    `;

});

/* ==========================
   Button Ripple
========================== */

document.querySelectorAll(".glass-btn").forEach(btn=>{

    btn.addEventListener("mouseenter",()=>{

        btn.style.transform =
            "translateY(-6px) scale(1.02)";

    });

    btn.addEventListener("mouseleave",()=>{

        btn.style.transform =
            "";

    });

});

/* ==========================
   Scroll Reveal
========================== */

const observer = new IntersectionObserver(entries=>{

    entries.forEach(entry=>{

        if(entry.isIntersecting){

            entry.target.animate([

                {
                    opacity:0,
                    transform:"translateY(30px)"
                },

                {
                    opacity:1,
                    transform:"translateY(0)"
                }

            ],{

                duration:700,
                easing:"ease",
                fill:"forwards"

            });

        }

    });

},{
    threshold:.2
});

document.querySelectorAll(

    ".glass-panel,.glass-btn,.profile-info"

).forEach(el=>{

    observer.observe(el);

});

/* ==========================
   Floating Background
========================== */

const blobs = document.querySelectorAll(".blob");

window.addEventListener("mousemove",(e)=>{

    const x =
        (e.clientX / window.innerWidth - .5);

    const y =
        (e.clientY / window.innerHeight - .5);

    blobs.forEach((blob,index)=>{

        const speed =
            (index+1)*12;

        blob.style.transform = `
            translate(
                ${x*speed}px,
                ${y*speed}px
            )
        `;

    });

});

/* ==========================
   Glass Reflection
========================== */

card.addEventListener("mousemove",(e)=>{

    const rect = card.getBoundingClientRect();

    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;

    card.style.background = `
        radial-gradient(
            circle at ${x}px ${y}px,
            rgba(255,255,255,.30),
            rgba(255,255,255,.15) 45%,
            rgba(255,255,255,.10) 100%
        )
    `;

});

card.addEventListener("mouseleave",()=>{

    card.style.background =
        "rgba(255,255,255,.16)";

});

/* ==========================
   Mobile Fix
========================== */

if("ontouchstart" in window){

    glow.style.display="none";

}

/* ==========================
   Smooth Load
========================== */

window.addEventListener("load",()=>{

    card.animate([

        {
            opacity:0,
            transform:"translateY(40px) scale(.96)"
        },

        {
            opacity:1,
            transform:"translateY(0) scale(1)"
        }

    ],{

        duration:900,
        easing:"cubic-bezier(.22,1,.36,1)",
        fill:"forwards"

    });

});

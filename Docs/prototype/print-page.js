/* A print page: reads what was typed on the form (passed in the address), or shows the sample, and lays out one sheet per copy. */
(function () {
  const layout = document.body.dataset.layout;
  const bare = /[?&]bare/.test(location.search);
  if (bare) document.body.classList.add("bare");
  let data = { s: MAD.SAMPLE, copies: 3, names: [] };
  try { if (location.hash.length > 1) data = Object.assign(data, JSON.parse(decodeURIComponent(escape(atob(location.hash.slice(1)))))); } catch (e) {}
  const n = bare ? 1 : Math.max(1, Math.min(10, +data.copies || 3));
  document.getElementById("desk").innerHTML = Array.from({ length: n }, (_, i) => MAD.render(data.s, layout, MAD.copyName(i, data.names))).join("");
  const size = { form: "210mm 297mm", half: "148mm 210mm", slip: "80mm 320mm" }[layout];
  const st = document.createElement("style"); st.textContent = `@page { size: ${size}; margin: 0; }`; document.head.appendChild(st);
  const bar = document.getElementById("bar");
  if (bar) {
    const links = [["form", "Official form (A4)"], ["half", "Half page (A5)"], ["slip", "Receipt slip (80 mm)"]];
    bar.innerHTML = `<strong>Print preview</strong>${links.map(([l, t]) => `<a class="${l === layout ? "on" : ""}" href="print-${l}.html${location.hash}">${t}</a>`).join("")}<a href="prints.html">All layouts</a><span>${n} ${n === 1 ? "copy" : "copies"} · ${location.hash.length > 1 ? "your receipt" : "sample data"}</span><button class="go" onclick="window.print()">Print ${n} ${n === 1 ? "copy" : "copies"}</button>`;
  }
})();

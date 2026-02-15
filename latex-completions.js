/**
 * latex-completions.js — LaTeX command dictionary + search
 *
 * Public API:
 *  LatexCompletions.search(query) — prefix match, returns up to 8 results
 */

const LatexCompletions = (function () {
  // Each entry: { name, template, cursorOffset, detail }
  // name:         command without backslash
  // template:     full insertion text (includes backslash)
  // cursorOffset: chars back from end to place cursor (0 = end)
  // detail:       dropdown description with Unicode preview

  const commands = [
    // Greek lowercase
    { name: 'alpha',    template: '\\alpha',    cursorOffset: 0, detail: 'Greek: \u03b1' },
    { name: 'beta',     template: '\\beta',     cursorOffset: 0, detail: 'Greek: \u03b2' },
    { name: 'gamma',    template: '\\gamma',    cursorOffset: 0, detail: 'Greek: \u03b3' },
    { name: 'delta',    template: '\\delta',    cursorOffset: 0, detail: 'Greek: \u03b4' },
    { name: 'epsilon',  template: '\\epsilon',  cursorOffset: 0, detail: 'Greek: \u03b5' },
    { name: 'varepsilon', template: '\\varepsilon', cursorOffset: 0, detail: 'Greek: \u03b5' },
    { name: 'zeta',     template: '\\zeta',     cursorOffset: 0, detail: 'Greek: \u03b6' },
    { name: 'eta',      template: '\\eta',      cursorOffset: 0, detail: 'Greek: \u03b7' },
    { name: 'theta',    template: '\\theta',    cursorOffset: 0, detail: 'Greek: \u03b8' },
    { name: 'vartheta', template: '\\vartheta', cursorOffset: 0, detail: 'Greek: \u03d1' },
    { name: 'iota',     template: '\\iota',     cursorOffset: 0, detail: 'Greek: \u03b9' },
    { name: 'kappa',    template: '\\kappa',    cursorOffset: 0, detail: 'Greek: \u03ba' },
    { name: 'lambda',   template: '\\lambda',   cursorOffset: 0, detail: 'Greek: \u03bb' },
    { name: 'mu',       template: '\\mu',       cursorOffset: 0, detail: 'Greek: \u03bc' },
    { name: 'nu',       template: '\\nu',       cursorOffset: 0, detail: 'Greek: \u03bd' },
    { name: 'xi',       template: '\\xi',       cursorOffset: 0, detail: 'Greek: \u03be' },
    { name: 'pi',       template: '\\pi',       cursorOffset: 0, detail: 'Greek: \u03c0' },
    { name: 'rho',      template: '\\rho',      cursorOffset: 0, detail: 'Greek: \u03c1' },
    { name: 'sigma',    template: '\\sigma',    cursorOffset: 0, detail: 'Greek: \u03c3' },
    { name: 'tau',      template: '\\tau',      cursorOffset: 0, detail: 'Greek: \u03c4' },
    { name: 'upsilon',  template: '\\upsilon',  cursorOffset: 0, detail: 'Greek: \u03c5' },
    { name: 'phi',      template: '\\phi',      cursorOffset: 0, detail: 'Greek: \u03c6' },
    { name: 'varphi',   template: '\\varphi',   cursorOffset: 0, detail: 'Greek: \u03d5' },
    { name: 'chi',      template: '\\chi',      cursorOffset: 0, detail: 'Greek: \u03c7' },
    { name: 'psi',      template: '\\psi',      cursorOffset: 0, detail: 'Greek: \u03c8' },
    { name: 'omega',    template: '\\omega',    cursorOffset: 0, detail: 'Greek: \u03c9' },

    // Greek uppercase
    { name: 'Gamma',    template: '\\Gamma',    cursorOffset: 0, detail: 'Greek: \u0393' },
    { name: 'Delta',    template: '\\Delta',    cursorOffset: 0, detail: 'Greek: \u0394' },
    { name: 'Theta',    template: '\\Theta',    cursorOffset: 0, detail: 'Greek: \u0398' },
    { name: 'Lambda',   template: '\\Lambda',   cursorOffset: 0, detail: 'Greek: \u039b' },
    { name: 'Xi',       template: '\\Xi',       cursorOffset: 0, detail: 'Greek: \u039e' },
    { name: 'Pi',       template: '\\Pi',       cursorOffset: 0, detail: 'Greek: \u03a0' },
    { name: 'Sigma',    template: '\\Sigma',    cursorOffset: 0, detail: 'Greek: \u03a3' },
    { name: 'Phi',      template: '\\Phi',      cursorOffset: 0, detail: 'Greek: \u03a6' },
    { name: 'Psi',      template: '\\Psi',      cursorOffset: 0, detail: 'Greek: \u03a8' },
    { name: 'Omega',    template: '\\Omega',    cursorOffset: 0, detail: 'Greek: \u03a9' },

    // Operators
    { name: 'frac',     template: '\\frac{}{}',     cursorOffset: 3, detail: 'Fraction: a/b' },
    { name: 'sqrt',     template: '\\sqrt{}',        cursorOffset: 1, detail: 'Square root: \u221a' },
    { name: 'sum',      template: '\\sum',            cursorOffset: 0, detail: 'Summation: \u2211' },
    { name: 'prod',     template: '\\prod',           cursorOffset: 0, detail: 'Product: \u220f' },
    { name: 'int',      template: '\\int',            cursorOffset: 0, detail: 'Integral: \u222b' },
    { name: 'iint',     template: '\\iint',           cursorOffset: 0, detail: 'Double integral: \u222c' },
    { name: 'iiint',    template: '\\iiint',          cursorOffset: 0, detail: 'Triple integral: \u222d' },
    { name: 'oint',     template: '\\oint',           cursorOffset: 0, detail: 'Contour integral: \u222e' },
    { name: 'partial',  template: '\\partial',        cursorOffset: 0, detail: 'Partial: \u2202' },
    { name: 'nabla',    template: '\\nabla',          cursorOffset: 0, detail: 'Nabla: \u2207' },
    { name: 'lim',      template: '\\lim',            cursorOffset: 0, detail: 'Limit' },
    { name: 'inf',      template: '\\inf',            cursorOffset: 0, detail: 'Infimum' },
    { name: 'sup',      template: '\\sup',            cursorOffset: 0, detail: 'Supremum' },
    { name: 'max',      template: '\\max',            cursorOffset: 0, detail: 'Maximum' },
    { name: 'min',      template: '\\min',            cursorOffset: 0, detail: 'Minimum' },
    { name: 'log',      template: '\\log',            cursorOffset: 0, detail: 'Logarithm' },
    { name: 'ln',       template: '\\ln',             cursorOffset: 0, detail: 'Natural log' },
    { name: 'exp',      template: '\\exp',            cursorOffset: 0, detail: 'Exponential' },
    { name: 'sin',      template: '\\sin',            cursorOffset: 0, detail: 'Sine' },
    { name: 'cos',      template: '\\cos',            cursorOffset: 0, detail: 'Cosine' },
    { name: 'tan',      template: '\\tan',            cursorOffset: 0, detail: 'Tangent' },

    // Relations
    { name: 'leq',      template: '\\leq',      cursorOffset: 0, detail: 'Less or equal: \u2264' },
    { name: 'geq',      template: '\\geq',      cursorOffset: 0, detail: 'Greater or equal: \u2265' },
    { name: 'neq',      template: '\\neq',      cursorOffset: 0, detail: 'Not equal: \u2260' },
    { name: 'approx',   template: '\\approx',   cursorOffset: 0, detail: 'Approximately: \u2248' },
    { name: 'equiv',    template: '\\equiv',    cursorOffset: 0, detail: 'Equivalent: \u2261' },
    { name: 'sim',      template: '\\sim',      cursorOffset: 0, detail: 'Similar: \u223c' },
    { name: 'subset',   template: '\\subset',   cursorOffset: 0, detail: 'Subset: \u2282' },
    { name: 'supset',   template: '\\supset',   cursorOffset: 0, detail: 'Superset: \u2283' },
    { name: 'subseteq', template: '\\subseteq', cursorOffset: 0, detail: 'Subset or equal: \u2286' },
    { name: 'supseteq', template: '\\supseteq', cursorOffset: 0, detail: 'Superset or equal: \u2287' },
    { name: 'in',       template: '\\in',       cursorOffset: 0, detail: 'Element of: \u2208' },
    { name: 'notin',    template: '\\notin',    cursorOffset: 0, detail: 'Not element of: \u2209' },
    { name: 'cup',      template: '\\cup',      cursorOffset: 0, detail: 'Union: \u222a' },
    { name: 'cap',      template: '\\cap',      cursorOffset: 0, detail: 'Intersection: \u2229' },

    // Arrows
    { name: 'rightarrow',     template: '\\rightarrow',     cursorOffset: 0, detail: 'Arrow: \u2192' },
    { name: 'leftarrow',      template: '\\leftarrow',      cursorOffset: 0, detail: 'Arrow: \u2190' },
    { name: 'leftrightarrow', template: '\\leftrightarrow', cursorOffset: 0, detail: 'Arrow: \u2194' },
    { name: 'Rightarrow',     template: '\\Rightarrow',     cursorOffset: 0, detail: 'Arrow: \u21d2' },
    { name: 'Leftarrow',      template: '\\Leftarrow',      cursorOffset: 0, detail: 'Arrow: \u21d0' },
    { name: 'Leftrightarrow', template: '\\Leftrightarrow', cursorOffset: 0, detail: 'Arrow: \u21d4' },
    { name: 'mapsto',         template: '\\mapsto',         cursorOffset: 0, detail: 'Arrow: \u21a6' },
    { name: 'to',             template: '\\to',             cursorOffset: 0, detail: 'Arrow: \u2192' },

    // Accents & decorations
    { name: 'hat',      template: '\\hat{}',      cursorOffset: 1, detail: 'Hat accent: \u0302' },
    { name: 'bar',      template: '\\bar{}',      cursorOffset: 1, detail: 'Bar accent: \u0304' },
    { name: 'vec',      template: '\\vec{}',      cursorOffset: 1, detail: 'Vector arrow' },
    { name: 'dot',      template: '\\dot{}',      cursorOffset: 1, detail: 'Dot accent: \u0307' },
    { name: 'ddot',     template: '\\ddot{}',     cursorOffset: 1, detail: 'Double dot: \u0308' },
    { name: 'tilde',    template: '\\tilde{}',    cursorOffset: 1, detail: 'Tilde: \u0303' },
    { name: 'overline', template: '\\overline{}', cursorOffset: 1, detail: 'Overline' },

    // Delimiters
    { name: 'left(',    template: '\\left( \\right)', cursorOffset: 8, detail: 'Left paren' },
    { name: 'left[',    template: '\\left[ \\right]', cursorOffset: 8, detail: 'Left bracket' },
    { name: 'langle',   template: '\\langle',   cursorOffset: 0, detail: 'Left angle: \u27e8' },
    { name: 'rangle',   template: '\\rangle',   cursorOffset: 0, detail: 'Right angle: \u27e9' },
    { name: 'lceil',    template: '\\lceil',    cursorOffset: 0, detail: 'Left ceiling: \u2308' },
    { name: 'rceil',    template: '\\rceil',    cursorOffset: 0, detail: 'Right ceiling: \u2309' },
    { name: 'lfloor',   template: '\\lfloor',   cursorOffset: 0, detail: 'Left floor: \u230a' },
    { name: 'rfloor',   template: '\\rfloor',   cursorOffset: 0, detail: 'Right floor: \u230b' },

    // Formatting
    { name: 'mathbb',   template: '\\mathbb{}',   cursorOffset: 1, detail: 'Blackboard bold' },
    { name: 'mathcal',  template: '\\mathcal{}',  cursorOffset: 1, detail: 'Calligraphic' },
    { name: 'mathbf',   template: '\\mathbf{}',   cursorOffset: 1, detail: 'Bold math' },
    { name: 'mathit',   template: '\\mathit{}',   cursorOffset: 1, detail: 'Italic math' },
    { name: 'mathrm',   template: '\\mathrm{}',   cursorOffset: 1, detail: 'Roman (upright)' },
    { name: 'text',     template: '\\text{}',     cursorOffset: 1, detail: 'Text in math' },
    { name: 'binom',    template: '\\binom{}{}',  cursorOffset: 3, detail: 'Binomial coefficient' },

    // Misc symbols
    { name: 'infty',    template: '\\infty',    cursorOffset: 0, detail: 'Infinity: \u221e' },
    { name: 'forall',   template: '\\forall',   cursorOffset: 0, detail: 'For all: \u2200' },
    { name: 'exists',   template: '\\exists',   cursorOffset: 0, detail: 'Exists: \u2203' },
    { name: 'neg',      template: '\\neg',      cursorOffset: 0, detail: 'Negation: \u00ac' },
    { name: 'land',     template: '\\land',     cursorOffset: 0, detail: 'Logical and: \u2227' },
    { name: 'lor',      template: '\\lor',      cursorOffset: 0, detail: 'Logical or: \u2228' },
    { name: 'cdot',     template: '\\cdot',     cursorOffset: 0, detail: 'Center dot: \u00b7' },
    { name: 'cdots',    template: '\\cdots',    cursorOffset: 0, detail: 'Center dots: \u22ef' },
    { name: 'ldots',    template: '\\ldots',    cursorOffset: 0, detail: 'Low dots: \u2026' },
    { name: 'times',    template: '\\times',    cursorOffset: 0, detail: 'Times: \u00d7' },
    { name: 'div',      template: '\\div',      cursorOffset: 0, detail: 'Division: \u00f7' },
    { name: 'pm',       template: '\\pm',       cursorOffset: 0, detail: 'Plus-minus: \u00b1' },
    { name: 'mp',       template: '\\mp',       cursorOffset: 0, detail: 'Minus-plus: \u2213' },
    { name: 'emptyset', template: '\\emptyset', cursorOffset: 0, detail: 'Empty set: \u2205' },
    { name: 'quad',     template: '\\quad',     cursorOffset: 0, detail: 'Quad space' },
    { name: 'qquad',    template: '\\qquad',    cursorOffset: 0, detail: 'Double quad space' },
  ];

  function search(query) {
    const q = query.toLowerCase();
    const results = [];
    for (let i = 0; i < commands.length; i++) {
      if (commands[i].name.toLowerCase().startsWith(q)) {
        results.push(commands[i]);
        if (results.length >= 8) break;
      }
    }
    return results;
  }

  return { search };
})();

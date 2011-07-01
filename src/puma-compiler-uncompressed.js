(function (Puma, document, undefined) {

function compileBranch(branch) {
    if (branch.arity == 'binary')
        return '(function(){' + Puma.Compiler.compile(branch, true).replace('~e', 'return') + '})()';
    return Puma.Compiler.compile(branch, true).replace('~e', '');
}

Puma.Compiler = {
    cache: [],
    cacheSize: 30,
    can: [],
    canSize: 100,
    
    compiled: {
        'unary#': '~e[c.getElementById("~v")]',
        'unary.': document.getElementsByClassName ? '~e[].slice.call(c.getElementsByClassName("~v"))' :
          '~e Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"~v")>-1})',
        'binary#': 'var l=~l;~e Puma.f(c.getElementsByTagName("*"),function(e){return e.id=="~v"&&Puma.i(l,e)>-1})',
        'binary.': document.getElementsByClassName ?
          'var l=~l;~e Puma.f(c.getElementsByClassName("~v"),function(e){return Puma.i(l,e)>-1})' :
          'var l=~l;~e Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"~v")>-1&&Puma.i(l,e)>-1})',
        'binary ': 'var l=~l;~e Puma.f(~r,function(e){var p=e;while(p=p.parentNode)if(Puma.i(l,p)>-1)return 1;return 0})'
    },
    
    canCompile: function (tree) {
        if (this.can[tree.query] != undefined)
            return this.can[tree.query];
        if (tree instanceof Puma.AST.Tag)
            return true;
        var can = !!this.compiled[tree.arity + tree.value] && (!tree.left || this.canCompile(tree.left)) &&
        this.canCompile(tree.right);
        this.can.push(tree.query);
        this.can[tree.query] = can;
        if (this.can.length > this.canSize)
            this.can[this.can.shift()] = undefined;
        return can;
    },
    
    compile: function (tree, noFn) {
        if (this.cache[tree.query])
            return this.cache[tree.query];
        var fn, func, isSane = document.body instanceof Object;
        if (tree.arity == 'ident')
            fn = (isSane ? '~e[].slice.call(' : '~e Puma.f(') + 'c.getElementsByTagName("' +
            tree.value + '")' + (isSane ? ')' : ',function(){return 1})');
        else {
            fn = this.compiled[tree.arity + tree.value].replace('~v', tree.right.value);
            if (tree.arity == 'binary')
                fn = fn.replace('~l', compileBranch(tree.left)).replace('~r', compileBranch(tree.right));
        }
        func = noFn ? fn : Function('c', fn.replace('~e', 'return'));
        if (!noFn) {
            this.cache.push(tree.query);
            this.cache[tree.query] = func;
            if (this.cache.length > this.cacheSize)
                this.cache[this.cache.shift()] = undefined;
        }
        return func;
    }
};

})(Puma, document);

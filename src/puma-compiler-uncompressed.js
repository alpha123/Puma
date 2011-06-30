(function (Puma, document, undefined) {

Puma.Compiler = {
    cache: [],
    cacheSize: 30,
    can: [],
    canSize: 100,
    
    compiled: {
        'unary#': 'return[c.getElementById("~v")]',
        'unary.': document.getElementsByClassName ? 'return[].slice.call(c.getElementsByClassName("~v"))' :
          'return Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"~v")>-1})',
        'binary#': 'var l=~l;return Puma.f(c.getElementsByTagName("*"),function(e){return e.id=="~v"&&Puma.i(l,e)>-1})',
        'binary.': document.getElementsByClassName ?
          'var l=~l;return Puma.f(c.getElementsByClassName("~v"),function(e){return Puma.i(l,e)>-1})' :
          'var l=~l;return Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"~v")>-1&&Puma.i(l,e)>-1})',
        'binary ': 'var l=~l;return Puma.f(~r,function(e){var p=e;while(p=p.parentNode)if(Puma.i(l,p)>-1)return 1;return 0})'
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
        if (tree instanceof Puma.AST.UnOp)
            fn = this.compiled['unary' + tree.value].replace('~v', tree.right.value);
        else if (tree instanceof Puma.AST.BinOp) {
            fn = this.compiled['binary' + tree.value]
              .replace('~v', tree.right.value)
              .replace('~l', '(function(){' + this.compile(tree.left, true) + '})()')
              .replace('~r', '(function(){' + this.compile(tree.right, true) + '})()');
        }
        else // Puma.AST.Tag
            fn = (isSane ? 'return[].slice.call(' : 'return Puma.f(') + 'c.getElementsByTagName("' +
            tree.value + '")' + (isSane ? ')' : ',function(){return 1})');
        func = noFn ? fn : Function('c', fn);
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

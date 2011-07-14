(function (Puma, document, undefined) {

function compileBranch(branch) {
    var compiled = this.compile(branch, true); // Use "this" to allow for extensibility (see the Puma Matcher)
    if (branch.arity == 'binary')
        return '(function(){' + compiled.replace('#r', 'return') + '})()';
    return compiled.replace('#r', '');
}

var byClass = document.getElementsByClassName;

Puma.Compiler = {
    cache: [],
    cacheSize: 30,
    can: [],
    canSize: 100,
    
    compiled: {
        'ident': function (value) {
            if (document.body instanceof Object) // Can't check earlier because the DOM might not be loaded
                return '#r[].slice.call(c.getElementsByTagName("' + value + '"))';
            return '#r Puma.f(c.getElementsByTagName("' + value + '"),function(){return 1})';
        },
        'unary#': function (value) { return '#r[c.getElementById("' + value + '")]'; },
        'unary.': function (value) {
            return byClass ? '#r[].slice.call(c.getElementsByClassName("' + value + '"))' :
            '#r Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"' + value + '")>-1})';
        },
        'binary#': function (value, left, _, leftBranch) {
            if (leftBranch.arity == 'ident') // Do a little optimization
                return 'var e=c.getElementById("' + value + '");#r e&&e.tagName.toUpperCase()=="' + leftBranch.value.toUpperCase() + '"?[e]:[]';
            return 'var l=' + left + ';#r Puma.f(c.getElementsByTagName("*"),function(e){return e.id=="' + value + '"&&Puma.i(l,e)>-1})';
        },
        'binary.': function (value, left, _, leftBranch) {
            if (leftBranch.arity == 'ident' && byClass)
                return '#r Puma.f(c.getElementsByClassName("' + value +
                  '"),function(e){return e.tagName.toUpperCase()=="' + leftBranch.value.toUpperCase() + '"})';
            return byClass ?
              'var l=' + left + ';#r Puma.f(c.getElementsByClassName("' + value + '"),function(e){return Puma.i(l,e)>-1})' :
              'var l=' + left + ';#r Puma.f(c.getElementsByTagName("*"),function(e){return Puma.i(e.className.split(" "),"' +
              value + '")>-1&&Puma.i(l,e)>-1})'
        },
        'binary ': function (value, left, right, leftBranch, rightBranch) {
            if (leftBranch.arity != 'binary' && document.body instanceof Object) {
                var str = 'for(var l=' + left + ',i=0,j=l.length,n=[];i<j;)n.push.apply(n,n.slice.call(l[i++].';
                if (rightBranch.arity == 'ident')
                    return str + 'getElementsByTagName("' + value + '")));#r n';
                else if (rightBranch.arity == 'unary' && rightBranch.value == '.' && byClass)
                    return str + 'getElementsByClassName("' + rightBranch.right.value + '")));#r n';
            }
            return 'var l=' + left + ';#r Puma.f(' + right + ',function(e){var p=e;while(p=p.parentNode)if(Puma.i(l,p)>-1)return 1;return 0})'
        }
    },
    
    canCompile: function (tree) {
        if (this.can[tree.query] != undefined)
            return this.can[tree.query];
        if (tree.arity == 'ident')
            return true;
        var can = !!this.compiled[tree.arity + tree.value] && (!tree.left ||
        this.canCompile(tree.left)) && this.canCompile(tree.right);
        this.can.push(tree.query);
        this.can[tree.query] = can;
        if (this.can.length > this.canSize)
            this.can[this.can.shift()] = undefined;
        return can;
    },
    
    compile: function (tree, noFn) {
        if (this.cache[tree.query])
            return this.cache[tree.query];
        var fn, func;
        if (tree.arity == 'ident')
            fn = this.compiled['ident'](tree.value);
        else if (tree.arity == 'unary')
            fn = this.compiled['unary' + tree.value](tree.right.value, tree.right);
        else
            fn = this.compiled['binary' + tree.value](tree.right.value, compileBranch.call(this, tree.left),
              compileBranch.call(this, tree.right), tree.left, tree.right);
        func = noFn ? fn : Function('c', fn.replace('#r', 'return'));
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

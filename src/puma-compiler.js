(function (Puma, document, undefined) {

function compileBranch(branch) {
    var compiled = this.compile(branch, true); // Use "this" to allow for extensibility (see the Puma Matcher)
    if (branch.arity == 'binary')
        return '(function(){' + compiled.replace('#r', 'return') + '})()';
    return compiled.replace('#r', '');
}

var byClass = document.getElementsByClassName;

Puma.t = function (arrayLike) { // This is faster than [].slice.call - see http://jsperf.com/arguments-slice-vs-loop/2
    for (var i = 0, l = arrayLike.length, array = Array(l); i < l; ++i)
        array[i] = arrayLike[i];
    return array;
};

Puma.Compiler = {
    cache: [],
    cacheSize: 30,
    can: [],
    canSize: 100,
    
    compiled: {
        'ident': function (value) {
            if (document.body instanceof Object) // Can't check earlier because the DOM might not be loaded
                return '#r P.t(c.getElementsByTagName("' + value + '"))';
            return '#r P.f(c.getElementsByTagName("' + value + '"),function(){return 1})';
        },
        'unary#': function (value) { return '#r[c.getElementById("' + value + '")]'; },
        'unary.': function (value) {
            return byClass ? '#r P.t(c.getElementsByClassName("' + value + '"))' :
            '#r P.f(c.getElementsByTagName("*"),function(e){return P.i(e.className.split(" "),"' + value + '")>-1})';
        },
        'binary#': function (value, left, _, leftBranch) {
            if (leftBranch.arity == 'ident') // Do a little optimization
                return 'var e=c.getElementById("' + value + '");#r e&&e.tagName.toUpperCase()=="' + leftBranch.value.toUpperCase() + '"?[e]:[]';
            return 'var l=' + left + ';#r P.f(c.getElementsByTagName("*"),function(e){return e.id=="' + value + '"&&P.i(l,e)>-1})';
        },
        'binary.': function (value, left, _, leftBranch) {
            if (leftBranch.arity == 'ident' && byClass) {
                return '#r P.f(c.getElementsByClassName("' + value +
                  '"),function(e){return e.tagName.toUpperCase()=="' + leftBranch.value.toUpperCase() + '"})';
            }
            return byClass ?
              'var l=' + left + ';#r P.f(c.getElementsByClassName("' + value + '"),function(e){return P.i(l,e)>-1})' :
              'var l=' + left + ';#r P.f(c.getElementsByTagName("*"),function(e){return P.i(e.className.split(" "),"' +
              value + '")>-1&&P.i(l,e)>-1})'
        },
        'binary ': function (value, left, right, leftBranch, rightBranch) {
            if (leftBranch.arity != 'binary' && document.body instanceof Object) {
                var str = 'for(var l=' + left + ',i=0,j=l.length,n=[];i<j;)n.push.apply(n,n.slice.call(l[i++].';
                if (rightBranch.arity == 'ident')
                    return str + 'getElementsByTagName("' + value + '")));#r n';
                else if (rightBranch.arity == 'unary' && rightBranch.value == '.' && byClass)
                    return str + 'getElementsByClassName("' + rightBranch.right.value + '")));#r n';
            }
            return 'var l=' + left + ';#r P.f(' + right + ',function(e){var p=e;while(p=p.parentNode)if(P.i(l,p)>-1)return 1;return 0})'
        }
    },
    
    canCompile: function (tree) {
        if (this.can[tree.query] != undefined)
            return this.can[tree.query];
        function check(tree, compiled) {
            if (tree.arity == 'ident')
                return true;
            return !!compiled[tree.arity + tree.value] && (!tree.left ||
            check(tree.left, compiled)) && check(tree.right, compiled);
        }
        var can = check(tree, this.compiled);
        this.can.push(tree.query);
        this.can[tree.query] = can;
        if (this.can.length > this.canSize)
            this.can[this.can.shift()] = undefined;
        return can;
    },
    
    compile: function (tree, noFn) {
        if (this.cache[tree.query])
            return this.cache[tree.query];
        var fn, func, wrapped = function (context) {
            return func(context, Puma);
        };
        if (tree.arity == 'ident')
            fn = this.compiled['ident'](tree.value);
        else if (tree.arity == 'unary')
            fn = this.compiled['unary' + tree.value](tree.right.value, tree.right);
        else
            fn = this.compiled['binary' + tree.value](tree.right.value, compileBranch.call(this, tree.left),
              compileBranch.call(this, tree.right), tree.left, tree.right);
        func = noFn ? fn : Function('c,P', fn.replace('#r', 'return'));
        if (!noFn) {
            this.cache.push(tree.query);
            this.cache[tree.query] = wrapped;
            if (this.cache.length > this.cacheSize)
                this.cache[this.cache.shift()] = undefined;
        }
        return noFn ? func : wrapped;
    }
};

})(Puma, document);

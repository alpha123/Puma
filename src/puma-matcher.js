(function (Puma) {

Puma.Matcher = {
    cache: [],
    cacheSize: 30,
    can: [],
    canSize: 100,
    
    compiled: {
        'ident': function (value) { return '#r c.tagName.toUpperCase()=="' + value.toUpperCase() + '"'; },
        'unary#': function (value) { return '#r c.id=="' + value + '"'; },
        'unary.': function (value) { return '#r P.i(c.className.split(" "),"' + value + '")>-1'; },
        'binary#': function (value, left) { return '#r' + left + '&&c.id=="' + value + '"'; },
        'binary.': function (value, left) { return '#r' + left + '&&P.i(c.className.split(" "),"' + value + '")>-1'; },
        'binary ': function (_, left, right) {
            return '#r' + right + '&&(function(c){while((c=c.parentNode)&&c.nodeType==1)if(' + left + ')return !0;return !1})(c);';
        },
        'binary[': function (value, left, right, _, rightBranch) {
            if (rightBranch.left)
                return '#r' + left + '&&P.g(c,"' + rightBranch.left.value + '")' + this['binary' + value](rightBranch.right.value);
            return '#r' + left + '&&P.g(c,"' + value + '")!=null';
        },
        'binary=': function (value) { return '=="' + value + '"'; },
        'binary!=': function (value) { return '!="' + value + '"'; }
    },
    
    canCompile: function (tree) {
        return Puma.Compiler.canCompile.call(Puma.Matcher, tree);
    },
    
    compile: function (tree, noFn) {
        return Puma.Compiler.compile.call(Puma.Matcher, tree, noFn);
    }
};

Puma.match = function (elem, selector) {
    return Puma.Matcher.canCompile(Puma.Parser.parse(selector)) ?
    Puma.Matcher.compile(Puma.Parser.parse(selector))(elem) :
    Puma.arrayIndexOf(Puma(selector), elem) > -1;
};

})(Puma);

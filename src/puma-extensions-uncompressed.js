Puma.operators.binary['|='] = function (nodes, left, right) {
    return arrayFilter(nodes, function (e) {
        var attr = e.getAttribute(left.value);
        return attr && attr.indexOf(right.value) >= 0 || attr.indexOf(right.value + '-') >= 0;
    });
};

Puma.operators.binary['~='] = function (nodes, left, right) {
    return arrayFilter(nodes, function (e) {
        var attr = e.getAttribute(left.value);
        return attr && arrayIndexOf(attr.split(' '), right.value) >= 0;
    });
}

Puma.pseudoclasses['only-child'] = function (elem) {
    var children = elem.parentNode.children;
    return children && children.length == 1 && children[0] == elem;
};

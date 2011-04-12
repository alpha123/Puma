(function () {

function createPseudoElement(name, elem, from, to, shift, elemType) {
    elemType = elemType || 'span';
    var split = splitStringAtIndex(elem.innerHTML, from, to),
    className = '-puma-pseudoelement-' + name;
    if (shift)
        split.shift();
    split.splice(from, 0, ['<', elemType, ' class="', className, '">'].join(''));
    split.splice(to + (shift ? 1 : 0), 0, ['</', elemType, '>'].join(''));
    elem.innerHTML = split.join('');
    if (elem.getElementsByClassName)
        return [].slice.call(elem.getElementsByClassName(className));
    return arrayFilter(elem.getElementsByTagName(elemType), function (e) {
        return arrayIndexOf(e.className.split(' '), className) >= 0;
    });
}
 
Puma.pseudoelements['first-letter'] = function (elem) {
    var innerText = elem.innerText || elem.textContent;
    if (!innerText || elem.parentNode == elem.ownerDocument.getElementsByTagName('head')[0])
        return [];
    return this.createPseudoElement('first-letter', elem, 0, 1, true);
}

})();

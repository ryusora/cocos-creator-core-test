/****************************************************************************
 Copyright (c) 2013-2014 Chukong Technologies Inc.

 http://www.cocos2d-x.org

 Permission is hereby granted, free of charge, to any person obtaining a copy
 of this software and associated documentation files (the "Software"), to deal
 in the Software without restriction, including without limitation the rights
 to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 copies of the Software, and to permit persons to whom the Software is
 furnished to do so, subject to the following conditions:

 The above copyright notice and this permission notice shall be included in
 all copies or substantial portions of the Software.

 THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 THE SOFTWARE.
 ****************************************************************************/


//---------------------- Customer render cmd --------------------
cc.CustomRenderCmd = function (target, func) {
    this._needDraw = true;
    this._target = target;
    this._callback = func;
};
cc.CustomRenderCmd.prototype.rendering = function (ctx, scaleX, scaleY) {
    if (!this._callback)
        return;
    this._callback.call(this._target, ctx, scaleX, scaleY);
};

var dirtyFlags = _ccsg.Node._dirtyFlags = {
    transformDirty: 1 << 0,
    visibleDirty:   1 << 1,
    colorDirty:     1 << 2,
    opacityDirty:   1 << 3,
    cacheDirty:     1 << 4,
    orderDirty:     1 << 5,
    textDirty:      1 << 6,
    gradientDirty:  1 << 7,
    textureDirty:   1 << 8,
    contentDirty:   1 << 9,
    cullingDirty:   1 << 10,
    COUNT: 9
};
cc.js.get(dirtyFlags, 'all', function () {
    var count = dirtyFlags.COUNT;
    return (1 << count) - 1;
}, false);
_ccsg.Node._requestDirtyFlag = function (key) {
    cc.assertID(!dirtyFlags[key], 1622, key);

    var count = dirtyFlags.COUNT;
    var value = 1 << count;
    dirtyFlags[key] = value;
    dirtyFlags.COUNT++;
    return value;
};

var ONE_DEGREE = Math.PI / 180;

function walkChildTree (root, funcName) {
    var index = 1;
    var children, child, curr, parentCmd, i, len;
    var stack = _ccsg.Node._performStacks[_ccsg.Node._performing];
    if (!stack) {
        stack = [];
        _ccsg.Node._performStacks.push(stack);
    }
    stack.length = 0;
    _ccsg.Node._performing++;
    stack[0] = root;

    var childChildren;
    while (index) {
        index--;
        curr = stack[index];
        // Avoid memory leak
        stack[index] = null;
        if (!curr) continue;
        children = curr._children;
        if (children && children.length > 0) {
            parentCmd = curr._renderCmd;
            for (i = 0, len = children.length; i < len; ++i) {
                child = children[i];
                stack[index] = child;
                index++;
                child._renderCmd[funcName](parentCmd);
            }
        }
    }
    _ccsg.Node._performing--;
}

//-------------------------Base -------------------------
_ccsg.Node.RenderCmd = function (renderable) {
    this._node = renderable;
    this._anchorPointInPoints = new cc.Vec2(0, 0);

    this._needDraw = false;
    this._dirtyFlag = 1;
    this._curLevel = -1;

    this._cameraFlag = 0;

    this._displayedColor = new cc.Color(255, 255, 255, 255);
    this._displayedOpacity = 255;
    this._cascadeColorEnabledDirty = false;
    this._cascadeOpacityEnabledDirty = false;

    this._transform = {a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0};
    this._worldTransform = {a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0};
    this._inverse = {a: 1, b: 0, c: 0, d: 1, tx: 0, ty: 0};
    this._transformUpdated = false;
    
    cc.renderer.pushDirtyNode(this);
};

_ccsg.Node.RenderCmd.prototype = {
    constructor: _ccsg.Node.RenderCmd,

    _ctor: _ccsg.Node.RenderCmd,

    getAnchorPointInPoints: function(){
        return cc.p(this._anchorPointInPoints);
    },

    getDisplayedColor: function(){
        var tmpColor = this._displayedColor;
        return cc.color(tmpColor.r, tmpColor.g, tmpColor.b, tmpColor.a);
    },

    getDisplayedOpacity: function(){
        return this._displayedOpacity;
    },

    setCascadeColorEnabledDirty: function(){
        this._cascadeColorEnabledDirty = true;
        this.setDirtyFlag(dirtyFlags.colorDirty);
    },

    setCascadeOpacityEnabledDirty:function(){
        this._cascadeOpacityEnabledDirty = true;
        this.setDirtyFlag(dirtyFlags.opacityDirty);
    },

    getParentToNodeTransform: function(){
        if (this._dirtyFlag & dirtyFlags.transformDirty) {
            cc.affineTransformInvertOut(this.getNodeToParentTransform(), this._inverse);
        }
        return this._inverse;
    },

    detachFromParent: function(){},

    _updateAnchorPointInPoint: function() {
        var locAPP = this._anchorPointInPoints, locSize = this._node._contentSize, locAnchorPoint = this._node._anchorPoint;
        locAPP.x = locSize.width * locAnchorPoint.x;
        locAPP.y = locSize.height * locAnchorPoint.y;
        this.setDirtyFlag(dirtyFlags.transformDirty);
    },

    setDirtyFlag: function(dirtyFlag){
        if (this._dirtyFlag === 0 && dirtyFlag !== 0)
            cc.renderer.pushDirtyNode(this);
        this._dirtyFlag |= dirtyFlag;
    },

    getParentRenderCmd: function(){
        if(this._node && this._node._parent && this._node._parent._renderCmd)
            return this._node._parent._renderCmd;
        return null;
    },

    updateTransform: function (parentCmd, recursive) {
        var node = this._node,
            pt = parentCmd ? parentCmd._worldTransform : null,
            t = this._transform,
            wt = this._worldTransform;         //get the world transform

        if (!this._transformUpdated) {
            var hasRotation = node._rotationX || node._rotationY;
            var hasSkew = node._skewX || node._skewY;
            var sx = node._scaleX, sy = node._scaleY;
            var appX = this._anchorPointInPoints.x, appY = this._anchorPointInPoints.y;
            var a = 1, b = 0, c = 0, d = 1;
            if (hasRotation || hasSkew) {
                // position
                t.tx = node._position.x;
                t.ty = node._position.y;

                // rotation
                if (hasRotation) {
                    var rotationRadiansX = node._rotationX * ONE_DEGREE;
                    c = Math.sin(rotationRadiansX);
                    d = Math.cos(rotationRadiansX);
                    if (node._rotationY === node._rotationX) {
                        a = d;
                        b = -c;
                    }
                    else {
                        var rotationRadiansY = node._rotationY * ONE_DEGREE;
                        a = Math.cos(rotationRadiansY);
                        b = -Math.sin(rotationRadiansY);
                    }
                }

                // scale
                t.a = a *= sx;
                t.b = b *= sx;
                t.c = c *= sy;
                t.d = d *= sy;

                // skew
                if (hasSkew) {
                    var skx = Math.tan(node._skewX * ONE_DEGREE);
                    var sky = Math.tan(node._skewY * ONE_DEGREE);
                    if (skx === Infinity)
                        skx = 99999999;
                    if (sky === Infinity)
                        sky = 99999999;
                    t.a = a + c * sky;
                    t.b = b + d * sky;
                    t.c = c + a * skx;
                    t.d = d + b * skx;
                }

                if (appX || appY) {
                    t.tx -= t.a * appX + t.c * appY;
                    t.ty -= t.b * appX + t.d * appY;
                    // adjust anchorPoint
                    if (node._ignoreAnchorPointForPosition) {
                        t.tx += appX;
                        t.ty += appY;
                    }
                }
            }
            else {
                t.a = sx;
                t.b = 0;
                t.c = 0;
                t.d = sy;
                t.tx = node._position.x;
                t.ty = node._position.y;

                if (appX || appY) {
                    t.tx -= t.a * appX;
                    t.ty -= t.d * appY;
                    // adjust anchorPoint
                    if (node._ignoreAnchorPointForPosition) {
                        t.tx += appX;
                        t.ty += appY;
                    }
                }
            }
        }

        // update world transform
        if (pt) {
            wt.a  = t.a  * pt.a + t.b  * pt.c;
            wt.b  = t.a  * pt.b + t.b  * pt.d;
            wt.c  = t.c  * pt.a + t.d  * pt.c;
            wt.d  = t.c  * pt.b + t.d  * pt.d;
            wt.tx = t.tx * pt.a + t.ty * pt.c + pt.tx;
            wt.ty = t.tx * pt.b + t.ty * pt.d + pt.ty;
        } else {
            wt.a = t.a;
            wt.b = t.b;
            wt.c = t.c;
            wt.d = t.d;
            wt.tx = t.tx;
            wt.ty = t.ty;
        }
    },

    transform: function (parentCmd, recursive) {
        this.updateTransform(parentCmd);

        if (this._currentRegion) {
            this._updateCurrentRegions();
            this._notifyRegionStatus && this._notifyRegionStatus(_ccsg.Node.CanvasRenderCmd.RegionStatus.DirtyDouble);
        }

        if (cc.macro.ENABLE_CULLING) {
            this._updateCameraFlag(parentCmd);
            
            if (this._doCulling) {
                this._doCulling();
            }
        }
        else if (this._doCulling) {
            this._needDraw = true;
        }

        if (recursive) {
            walkChildTree(this._node, 'transform');
        }
    },

    _updateCameraFlag: function (parentCmd) {
        var Camera = cc.Camera;
        
        if (cc._renderType === cc.game.RENDER_TYPE_WEBGL && Camera) {
            if (parentCmd && this._cameraFlag != Camera.flags.InCamera) {
                this._cameraFlag = parentCmd._cameraFlag > 0 ? Camera.flags.ParentInCamera : 0;
            }    
        }
        
    },

    culling: function (parentCmd, recursive) {
        if (!cc.macro.ENABLE_CULLING) {
            if (this._doCulling) {
                this._needDraw = true;
            }
            return;
        }
        
        this._updateCameraFlag(parentCmd);
        
        if (this._doCulling) {
            this._doCulling();
        }

        if (recursive) {
            walkChildTree(this._node, 'culling');
        }
    },

    getNodeToParentTransform: function () {
        if (this._dirtyFlag & dirtyFlags.transformDirty) {
            this.transform();
        }
        return this._transform;
    },

    setNodeToParentTransform: function(transform) {
        if (transform) {
            // use specified transform
            this._transform = transform;
            this._transformUpdated = true;
        } else {
            // not use the specified transform
            this._transformUpdated = false;
        }
        this.setDirtyFlag(dirtyFlags.transformDirty);
    },

    _propagateFlagsDown: function(parentCmd) {
        if (!parentCmd) return;

        //return;
        var locFlag = this._dirtyFlag;
        var parentNode = parentCmd._node;
        var parentFlag = parentCmd._dirtyFlag;

        //  There is a possibility:
        //    The parent element changed color, child element not change
        //    This will cause the parent element changed color
        //    But while the child element does not enter the circulation
        //    Here will be reset state in last
        //    In order the child elements get the parent state
        if(parentNode._cascadeColorEnabled && (parentFlag & dirtyFlags.colorDirty))
            locFlag |= dirtyFlags.colorDirty;

        if(parentNode._cascadeOpacityEnabled && (parentFlag & dirtyFlags.opacityDirty))
            locFlag |= dirtyFlags.opacityDirty;

        if (parentFlag & dirtyFlags.transformDirty) {
            locFlag |= dirtyFlags.transformDirty;
        }

        if (parentFlag & dirtyFlags.cullingDirty) {
            locFlag |= dirtyFlags.cullingDirty;
        }

        this._dirtyFlag = locFlag;
    },

    visit: function (parentCmd) {
        var node = this._node, renderer = cc.renderer;

        if (parentCmd) {
            this._curLevel = parentCmd._curLevel + 1;
        }
        this._propagateFlagsDown(parentCmd);

        if (isNaN(node._customZ)) {
            node._vertexZ = renderer.assignedZ;
            renderer.assignedZ += renderer.assignedZStep;
        }

        this._syncStatus(parentCmd);
    },

    _updateDisplayColor: function (parentColor) {
        var node = this._node;
        var locDispColor = this._displayedColor, locRealColor = node._realColor;
        var i, len, selChildren, item;
        this._notifyRegionStatus && this._notifyRegionStatus(_ccsg.Node.CanvasRenderCmd.RegionStatus.Dirty);
        if (this._cascadeColorEnabledDirty && !node._cascadeColorEnabled) {
            locDispColor.r = locRealColor.r;
            locDispColor.g = locRealColor.g;
            locDispColor.b = locRealColor.b;
            var whiteColor = new cc.Color(255, 255, 255, 255);
            selChildren = node._children;
            for (i = 0, len = selChildren.length; i < len; i++) {
                item = selChildren[i];
                if (item && item._renderCmd)
                    item._renderCmd._updateDisplayColor(whiteColor);
            }
            this._cascadeColorEnabledDirty = false;
        } else {
            if (parentColor === undefined) {
                var locParent = node._parent;
                if (locParent && locParent._cascadeColorEnabled)
                    parentColor = locParent.getDisplayedColor();
                else
                    parentColor = cc.Color.WHITE;
            }
            locDispColor.r = 0 | (locRealColor.r * parentColor.r / 255.0);
            locDispColor.g = 0 | (locRealColor.g * parentColor.g / 255.0);
            locDispColor.b = 0 | (locRealColor.b * parentColor.b / 255.0);
            if (node._cascadeColorEnabled) {
                selChildren = node._children;
                for (i = 0, len = selChildren.length; i < len; i++) {
                    item = selChildren[i];
                    if (item && item._renderCmd){
                        item._renderCmd._updateDisplayColor(locDispColor);
                        item._renderCmd._updateColor();
                    }
                }
            }
        }
        this._dirtyFlag &= ~dirtyFlags.colorDirty;
    },

    _updateDisplayOpacity: function (parentOpacity) {
        var node = this._node;
        var i, len, selChildren, item;
        this._notifyRegionStatus && this._notifyRegionStatus(_ccsg.Node.CanvasRenderCmd.RegionStatus.Dirty);
        if (this._cascadeOpacityEnabledDirty && !node._cascadeOpacityEnabled) {
            this._displayedOpacity = node._realOpacity;
            selChildren = node._children;
            for (i = 0, len = selChildren.length; i < len; i++) {
                item = selChildren[i];
                if (item && item._renderCmd)
                    item._renderCmd._updateDisplayOpacity(255);
            }
            this._cascadeOpacityEnabledDirty = false;
        } else {
            if (parentOpacity === undefined) {
                var locParent = node._parent;
                parentOpacity = 255;
                if (locParent && locParent._cascadeOpacityEnabled)
                    parentOpacity = locParent.getDisplayedOpacity();
            }
            this._displayedOpacity = node._realOpacity * parentOpacity / 255.0;
            if (node._cascadeOpacityEnabled) {
                selChildren = node._children;
                for (i = 0, len = selChildren.length; i < len; i++) {
                    item = selChildren[i];
                    if (item && item._renderCmd){
                        item._renderCmd._updateDisplayOpacity(this._displayedOpacity);
                        item._renderCmd._updateColor();
                    }
                }
            }
        }
        this._dirtyFlag &= ~dirtyFlags.opacityDirty;
    },

    _syncDisplayColor : function (parentColor) {
        var node = this._node, locDispColor = this._displayedColor, locRealColor = node._realColor;
        if (parentColor === undefined) {
            var locParent = node._parent;
            if (locParent && locParent._cascadeColorEnabled)
                parentColor = locParent.getDisplayedColor();
            else
                parentColor = cc.Color.WHITE;
        }
        locDispColor.r = 0 | (locRealColor.r * parentColor.r / 255.0);
        locDispColor.g = 0 | (locRealColor.g * parentColor.g / 255.0);
        locDispColor.b = 0 | (locRealColor.b * parentColor.b / 255.0);
    },

    _syncDisplayOpacity : function (parentOpacity) {
        var node = this._node;
        if (parentOpacity === undefined) {
            var locParent = node._parent;
            parentOpacity = 255;
            if (locParent && locParent._cascadeOpacityEnabled)
                parentOpacity = locParent.getDisplayedOpacity();
        }
        this._displayedOpacity = node._realOpacity * parentOpacity / 255.0;
    },

    _updateColor: function(){},

    updateStatus: function () {
        var locFlag = this._dirtyFlag;
        var colorDirty = locFlag & dirtyFlags.colorDirty,
            opacityDirty = locFlag & dirtyFlags.opacityDirty;

        if (locFlag & dirtyFlags.contentDirty) {
            this._notifyRegionStatus && this._notifyRegionStatus(_ccsg.Node.CanvasRenderCmd.RegionStatus.Dirty);
            this._dirtyFlag &= ~dirtyFlags.contentDirty;
        }

        if (colorDirty)
            this._updateDisplayColor();

        if (opacityDirty)
            this._updateDisplayOpacity();

        if (colorDirty || opacityDirty)
            this._updateColor();

        if (locFlag & dirtyFlags.transformDirty) {
            var parentCmd = this.getParentRenderCmd();
        
            //update the transform
            this.transform(parentCmd, true);
            this._dirtyFlag &= ~dirtyFlags.transformDirty;
            this._dirtyFlag &= ~dirtyFlags.cullingDirty;
        }
        else if (locFlag & dirtyFlags.cullingDirty) {
            this.culling(parentCmd, true);
            this._dirtyFlag &= ~dirtyFlags.cullingDirty;
        }
    },

    _syncStatus: function (parentCmd) {
        //  In the visit logic does not restore the _dirtyFlag
        //  Because child elements need parent's _dirtyFlag to change himself
        var locFlag = this._dirtyFlag;

        var colorDirty = locFlag & dirtyFlags.colorDirty,
            opacityDirty = locFlag & dirtyFlags.opacityDirty;

        if (colorDirty)
            //update the color
            this._syncDisplayColor();

        if (opacityDirty)
            //update the opacity
            this._syncDisplayOpacity();

        if (colorDirty || opacityDirty)
            this._updateColor();

        if (locFlag & dirtyFlags.transformDirty) {
            //update the transform
            this.transform(parentCmd);
        }
        else if (locFlag & dirtyFlags.cullingDirty) {
            this.culling(parentCmd);
        }
    }
};

_ccsg.Node.RenderCmd.prototype.originUpdateTransform = _ccsg.Node.RenderCmd.prototype.updateTransform;
_ccsg.Node.RenderCmd.prototype.originTransform = _ccsg.Node.RenderCmd.prototype.transform;
_ccsg.Node.RenderCmd.prototype.originCulling = _ccsg.Node.RenderCmd.prototype.culling;
_ccsg.Node.RenderCmd.prototype.originUpdateStatus = _ccsg.Node.RenderCmd.prototype.updateStatus;
_ccsg.Node.RenderCmd.prototype._originSyncStatus = _ccsg.Node.RenderCmd.prototype._syncStatus;

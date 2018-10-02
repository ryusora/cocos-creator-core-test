
if (!CC_JSB) {
    window.b2 = require('../../../external/box2d/box2d');
    if (CC_QQPLAY) {
        // can only define global variable in this way
        b2 = window.b2;
    }
}

require('./CCPhysicsManager');
require('./CCRigidBody');
require('./CCPhysicsContact');

require('./collider/CCPhysicsCollider');
require('./collider/CCPhysicsChainCollider');
require('./collider/CCPhysicsCircleCollider');
require('./collider/CCPhysicsBoxCollider');
require('./collider/CCPhysicsPolygonCollider');

require('./joint/CCJoint');
require('./joint/CCDistanceJoint');
require('./joint/CCRevoluteJoint');
require('./joint/CCMouseJoint');
require('./joint/CCMotorJoint');
require('./joint/CCPrismaticJoint');
require('./joint/CCWeldJoint');
require('./joint/CCWheelJoint');
require('./joint/CCRopeJoint');

if (!CC_JSB) {
    require('./platform/CCPhysicsDebugDraw');
    require('./platform/CCPhysicsUtils');
    require('./platform/CCPhysicsContactListner');
    require('./platform/CCPhysicsAABBQueryCallback');
    require('./platform/CCPhysicsRayCastCallback');
}
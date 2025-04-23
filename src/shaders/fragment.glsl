uniform sampler2D tDiffuse;
uniform float fTime;
uniform vec2 vResolution;
uniform vec3 vaSpherePositions[3];
uniform vec3 vaSphereColors[3];
uniform vec3 vCameraPosition;
uniform vec4 vCameraRotation;
uniform vec3 vLightDirection;
uniform float fBlendingFactor;
varying vec2 vUv;

const int MAX_SPHERES = 3;
const float SPHERE_RADIUS = 1.0;

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
    return mix(a, b, h) - k*h*(1.0-h);
}

float sceneSDF(vec3 p) {    
    float dists[MAX_SPHERES];
    for (int i = 0; i<3; i++) {
        dists[i] = length(p-vaSpherePositions[i])-SPHERE_RADIUS;
    }

    float d = dists[0];
    for (int i = 1;  i<3; i++) {
        d = smin(d, dists[i], fBlendingFactor * 2.0);
    }
    return d;
}

vec3 getNormal(vec3 p)
{
    float d0 = sceneSDF(p);
    const vec2 epsilon = vec2(.0001,0);
    vec3 d1 = vec3(
        sceneSDF(p-epsilon.xyy),
        sceneSDF(p-epsilon.yxy),
        sceneSDF(p-epsilon.yyx));
    return normalize(d0 - d1);
}

float sphereSDF(vec3 p, int sphereIndex) {
    return length(p-vaSpherePositions[sphereIndex]) - SPHERE_RADIUS;
}

vec3 getCol(vec3 p) {
    float dists[MAX_SPHERES];

    for (int i = 0; i<3; i++) {
        dists[i] = max(0.0,sphereSDF(p, i));
    }

    int closestSphere = -1;
    float distanceToClosestSphere;

    for (int i = 0; i<3; i++) {
        if (closestSphere == -1 || dists[i] < distanceToClosestSphere) {
            closestSphere = i;
            distanceToClosestSphere = dists[i];
        }
    }

    float t[MAX_SPHERES];
    float multiplier = 2.0;
    for (int i = 0; i<3; i++) {
        float distSum = distanceToClosestSphere + dists[i];

        if (distSum < 0.01) {
            t[i] = 1.0;
            multiplier = 1.0;
            continue;
        }

        t[i] = distanceToClosestSphere / distSum;
    }

    vec3 col = vec3(0.0);
    for (int i = 0; i<3; i++) {
        col += vaSphereColors[i] * t[i] * multiplier;
    }

    return col;
}

vec3 rotateByQuaternion(vec3 v, vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

vec4 mainImage(vec2 fragUV)
{
    vec2 uv = (fragUV-vec2(0.5))*vec2(vResolution.x/vResolution.y, 1.0);

    vec3 rayDir = normalize(vec3(2.0 * uv, -1));
    rayDir = rotateByQuaternion(rayDir, vCameraRotation);
    vec3 p = vCameraPosition;
    vec3 col = vec3(0);
    
    int steps = 0;
    
    while (steps < 100) {
        float d = sceneSDF(p);
        p = p+rayDir*d;
        if (d<0.0001) {
            col = getCol(p) * (vec3(0.1)+max(0.0, dot(getNormal(p), -vLightDirection)));
            break;
        }
        steps++;
    }

    return vec4(col, 1.0);
}

void main() {
    vec4 originalColor = texture2D(tDiffuse, vUv);
    gl_FragColor = originalColor + mainImage(vUv);
}
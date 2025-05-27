const int MAX_SPHERES = 3;
const int MAX_STEPS = 100;

uniform sampler2D tDiffuse;
uniform vec2 vResolution;
uniform vec3 vaSpherePositions[MAX_SPHERES];
uniform vec3 vaSphereColors[MAX_SPHERES];
uniform float faSphereRadii[MAX_SPHERES];
uniform vec3 vCameraPosition;
uniform vec4 vCameraRotation;
uniform vec3 vLightDirection;
uniform float fBlendingFactor;
uniform float fShadowSharpness;
uniform bool bSky;
uniform bool bSpecular;

varying vec2 vUv;

float smin(float a, float b, float k) {
    float h = clamp(0.5 + 0.5*(a-b)/k, 0.0, 1.0);
    return mix(a, b, h) - k*h*(1.0-h);
}

bool isSphereVisible(int sphereIndex) {
    return faSphereRadii[sphereIndex] > 0.01;
}

int firstVisibleSphere() {
    for (int i = 0; i<MAX_SPHERES; i++) {
        if (isSphereVisible(i)) {
            return i;
        }
    }
    return -1;
}

float sceneSDF(vec3 p) {    
    int firstVisibleIndex = firstVisibleSphere();
    if (firstVisibleIndex == -1) {
        return 10000.0;
    }

    float dists[MAX_SPHERES];
    for (int i = 0; i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

        dists[i] = length(p-vaSpherePositions[i])-faSphereRadii[i];
    }

    float d = dists[firstVisibleIndex];
    for (int i = firstVisibleIndex + 1;  i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

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
    return length(p-vaSpherePositions[sphereIndex]) - faSphereRadii[sphereIndex];
}

vec3 getCol(vec3 p) {
    float dists[MAX_SPHERES];

    for (int i = 0; i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

        dists[i] = max(0.0,sphereSDF(p, i));
    }

    int closestSphere = -1;
    float distanceToClosestSphere;

    for (int i = 0; i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

        if (closestSphere == -1 || dists[i] < distanceToClosestSphere) {
            closestSphere = i;
            distanceToClosestSphere = dists[i];
        }
    }

    float t[MAX_SPHERES];
    float multiplier = 2.0;
    for (int i = 0; i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

        float distSum = distanceToClosestSphere + dists[i];

        if (distSum < 0.01) {
            t[i] = 1.0;
            multiplier = 1.0;
            continue;
        }

        t[i] = distanceToClosestSphere / distSum;
    }

    vec3 col = vec3(0.0);
    for (int i = 0; i<MAX_SPHERES; i++) {
        if (!isSphereVisible(i)) {
            continue;
        }

        col += vaSphereColors[i] * t[i] * multiplier;
    }

    return col;
}

vec3 rotateByQuaternion(vec3 v, vec4 q) {
    return v + 2.0 * cross(q.xyz, cross(q.xyz, v) + q.w * v);
}

bool raymarch(vec3 rayOrigin, vec3 rayDir, out vec3 hitPoint) {
    float d = 0.0;
    vec3 p = rayOrigin;
    for (int i = 0; i < MAX_STEPS; i++) {
        d = sceneSDF(p);
        p = p + rayDir * d;
        if (d < 0.001) {
            hitPoint = p;
            return true;
        }
    }
    return false;
}

float computeShadowRes(vec3 rayOrigin, vec3 rayDir, float k) {
    float res = 1.0;
    float t = 0.01;
    for(int i=0; i<MAX_STEPS; i++) {
        float d = sceneSDF(rayOrigin + rayDir*t);

        if(d<0.001) {
            return 0.0;
        }

        res = min(res, k*d/t);
        t += d;
    }
    return res;
}

vec4 mainImage(vec2 fragUV)
{
    vec2 uv = (fragUV-vec2(0.5))*vec2(vResolution.x/vResolution.y, 1.0);

    vec3 rayDir = normalize(vec3(2.0 * uv, -1));
    rayDir = rotateByQuaternion(rayDir, vCameraRotation);
    vec3 p;

    if (raymarch(vCameraPosition, rayDir, p)) {
        float shadow = computeShadowRes(p, -vLightDirection, fShadowSharpness * 64.0);
        float diffuse = max(0.0, dot(getNormal(p), -vLightDirection)) * shadow;
        diffuse *= diffuse;

        // Compute specular highlight
        float specular = 0.0;
        if (bSpecular) {
            vec3 lightReflection = normalize(reflect(vLightDirection, getNormal(p)));
            vec3 viewDir = normalize(vCameraPosition - p);
            specular = pow(max(0.0, dot(lightReflection, viewDir)), 32.0) * shadow;
        }

        return vec4(getCol(p) * (diffuse + 0.1) + vec3(specular * 0.5), 1.0);
    } else if (bSky) {
        float skyLight = 0.5 * (0.5 * (rayDir.y * 0.5 + 0.5));
        float alignment = dot(rayDir, -vLightDirection);
        float sunLight = alignment > 0.05 ? pow(max(0.0, alignment), fShadowSharpness * 128.0) : 0.0;
        vec3 col = vec3(0.2, 0.6, 1.0) * skyLight + vec3(1.0, 0.9, 0.8) * sunLight;

        return vec4(col, 1.0);
    } else {
        return vec4(0.0, 0.0, 0.0, 1.0);
    }
}

void main() {
    vec4 originalColor = texture2D(tDiffuse, vUv);
    gl_FragColor = originalColor + mainImage(vUv);
}
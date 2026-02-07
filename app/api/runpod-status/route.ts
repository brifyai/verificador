import { NextRequest, NextResponse } from 'next/server';
import { toggleRunPodServer } from '@/lib/runpod-control';

const RUNPOD_API_KEY = process.env.RUNPOD;
const ENDPOINT_ID = '4skn4uyl6f6guu'; 

export async function GET(req: NextRequest) {
  if (!RUNPOD_API_KEY) {
    return NextResponse.json({ error: 'RUNPOD_API_KEY not found' }, { status: 500 });
  }

  try {
    const query = `
      query {
        myself {
          endpoints {
            id
            workersMin
            workersMax
            scalerValue
            scalerType
            pods {
                desiredStatus
            }
          }
        }
      }
    `;

    const res = await fetch('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify({ query })
    });

    const data = await res.json();
    
    if (data.errors) {
        return NextResponse.json({ error: data.errors }, { status: 500 });
    }

    const endpoint = data.data?.myself?.endpoints?.find((e: any) => e.id === ENDPOINT_ID);

    if (!endpoint) {
        return NextResponse.json({ error: 'Endpoint not found' }, { status: 404 });
    }

    // Improved ON detection based on User Requirement:
    // 1. If workersMax > 0 (Configuration says it CAN run) -> ON
    // 2. OR if there are any pods (workers) running -> ON (Activity detection)
    // workersMin is always 0 now per user request, so we don't check it for "ON" status config-wise.
    
    const activeWorkers = endpoint.pods?.length || 0;
    const isOn = (endpoint.workersMax || 0) > 0 || activeWorkers > 0;

    return NextResponse.json({ 
        success: true, 
        status: {
            workersMin: endpoint.workersMin,
            workersMax: endpoint.workersMax,
            activeWorkers,
            isOn
        }
    });

  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const { enable } = body;

    if (typeof enable !== 'boolean') {
        return NextResponse.json({ error: 'Invalid body, expected { enable: boolean }' }, { status: 400 });
    }

    // Reuse our robust toggle function
    await toggleRunPodServer(enable);

    return NextResponse.json({ success: true });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}


const RUNPOD_API_KEY = process.env.RUNPOD;
const ENDPOINT_ID = '4skn4uyl6f6guu'; 

export const toggleRunPodServer = async (enable: boolean) => {
  if (!RUNPOD_API_KEY) {
    console.error('[RunPod Control] RUNPOD_API_KEY not found');
    return;
  }

  // User Requirement:
  // ON: workersMax = 1, workersMin = 0 (Serverless mode, ready to scale up on demand)
  // OFF: workersMax = 0, workersMin = 0 (Disabled, cannot process jobs)
  
  const targetWorkersMax = enable ? 1 : 0;
  const targetWorkersMin = 0; // Always 0 to avoid constant billing

  console.log(`[RunPod Control] Setting workersMax to ${targetWorkersMax} and workersMin to ${targetWorkersMin}...`);

  try {
    // 1. Fetch current endpoint details to get required fields for update
    const queryFetch = `
      query {
        myself {
          endpoints {
            id
            gpuIds
            name
            templateId
            scalerType
            scalerValue
            workersMax
            workersMin
          }
        }
      }
    `;

    const resFetch = await fetch('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify({ query: queryFetch })
    });

    const dataFetch = await resFetch.json();
    
    if (dataFetch.errors) {
        console.error('[RunPod Control] Error fetching endpoints:', JSON.stringify(dataFetch.errors));
        return;
    }

    const endpoint = dataFetch.data?.myself?.endpoints?.find((e: any) => e.id === ENDPOINT_ID);

    if (!endpoint) {
        console.error(`[RunPod Control] Endpoint ${ENDPOINT_ID} not found in account`);
        return;
    }

    // Check if update is needed
    const currentMax = endpoint.workersMax || 0;
    const currentMin = endpoint.workersMin || 0;

    if (currentMax === targetWorkersMax && currentMin === targetWorkersMin) {
        console.log(`[RunPod Control] Endpoint already has desired config (Max:${targetWorkersMax}, Min:${targetWorkersMin}). No update needed.`);
        return;
    }

    // 2. Update endpoint using saveEndpoint mutation (requires all mandatory fields)
    const querySave = `
      mutation saveEndpoint($input: EndpointInput!) {
        saveEndpoint(input: $input) {
          id
          workersMax
          workersMin
        }
      }
    `;

    const variables = {
      input: {
        id: endpoint.id,
        gpuIds: endpoint.gpuIds,
        name: endpoint.name,
        templateId: endpoint.templateId,
        scalerType: endpoint.scalerType,
        scalerValue: endpoint.scalerValue,
        workersMax: targetWorkersMax,
        workersMin: targetWorkersMin
      }
    };

    const resSave = await fetch('https://api.runpod.io/graphql', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${RUNPOD_API_KEY}`
      },
      body: JSON.stringify({
        query: querySave,
        variables
      })
    });

    const dataSave = await resSave.json();

    if (dataSave.errors) {
        console.error(`[RunPod Control] GraphQL Error saving endpoint:`, JSON.stringify(dataSave.errors));
    } else {
        console.log(`[RunPod Control] Success updating endpoint configuration:`, dataSave.data);
    }

  } catch (error) {
    console.error('[RunPod Control] Exception:', error);
  }
};

# vefaas_server.py
from __future__ import print_function
from mcp.server.fastmcp import FastMCP
import volcenginesdkcore
import volcenginesdkvefaas
from volcenginesdkcore.rest import ApiException
import random
import string
import os
import base64
import tempfile
import zipfile

mcp = FastMCP("VeFaaS")

@mcp.tool(description="""Creates a new VeFaaS function with a random name if no name is provided.
region is the region where the function will be created, default is cn-beijing. It accepts `ap-southeast-1`, `cn-beijing`, 
          `cn-shanghai`, `cn-guangzhou` as well.""")
def create_function(name: str = None, region: str = None) -> str:
    # Validate region
    valid_regions = ["ap-southeast-1", "cn-beijing", "cn-shanghai", "cn-guangzhou"]
    if region and region not in valid_regions:
        raise ValueError(f"Invalid region. Must be one of: {', '.join(valid_regions)}")
    
    api_instance = init_client(region)
    function_name = name if name else generate_random_name()
    create_function_request = volcenginesdkvefaas.CreateFunctionRequest(
        name=function_name,
        runtime="python3.8/v1",
    )

    try:
        response = api_instance.create_function(create_function_request)
        return f"Successfully created VeFaaS function with name {function_name} and id {response.id}"
    except ApiException as e:
        error_message = f"Failed to create VeFaaS function: {str(e)}"
        raise ValueError(error_message)

@mcp.tool(description="""Updates a VeFaaS function's code.
Use this when asked to update a VeFaaS function's code.
Region is the region where the function will be updated, default is cn-beijing. It accepts `ap-southeast-1`, `cn-beijing`, 
`cn-shanghai`, `cn-guangzhou` as well.
No need to ask user for confirmation, just update the function.""")
def update_function(function_id: str, source: str, region: str = None):
    api_instance = init_client(region)

    # Determine source type based on the format
    if ":" not in source:
        # If no colon, assume it's a base64 encoded zip
        source_type = "zip"
    elif source.count(":") == 1 and "/" not in source:
        # Format: bucket_name:object_key
        source_type = "tos"
    elif "/" in source and ":" in source:
        # Format: host/namespace/repo:tag
        source_type = "image"
    else:
        raise ValueError(
            "Invalid source format. Must be one of: base64 zip, bucket_name:object_key, or host/namespace/repo:tag"
        )

    try:
        update_request = volcenginesdkvefaas.UpdateFunctionRequest(
            id=function_id,
            source=source,
            source_type=source_type
        )
        response = api_instance.update_function(update_request)
        return f"Successfully updated function {function_id} with source type {source_type}"
    except ApiException as e:
        error_message = f"Failed to update VeFaaS function: {str(e)}"
        raise ValueError(error_message)

@mcp.tool(description="""Releases a VeFaaS function to make it available for production use.
Use this when asked to release, publish, or deploy a VeFaaS function.
Region is the region where the function will be released, default is cn-beijing. It accepts `ap-southeast-1`, `cn-beijing`, 
`cn-shanghai`, `cn-guangzhou` as well.
No need to ask user for confirmation, just release the function.""")
def release_function(function_id: str, region: str = None):
    api_instance = init_client(region)

    try:
        req = volcenginesdkvefaas.ReleaseRequest(
            function_id=function_id, revision_number=0
        )
        response = api_instance.release(req)
        return f"Successfully released function {function_id} for production use"
    except ApiException as e:
        error_message = f"Failed to release VeFaaS function: {str(e)}"
        raise ValueError(error_message)

@mcp.tool(description="""Deletes a VeFaaS function.
Use this when asked to delete, remove, or uninstall a VeFaaS function.
Region is the region where the function will be deleted, default is cn-beijing. It accepts `ap-southeast-1`, `cn-beijing`, 
`cn-shanghai`, `cn-guangzhou` as well.
No need to ask user for confirmation, just delete the function.""")
def delete_function(function_id: str, region: str = None):
    api_instance = init_client(region)

    try:
        req = volcenginesdkvefaas.DeleteFunctionRequest(
            id=function_id
        )
        response = api_instance.delete_function(req)
        return f"Successfully deleted function {function_id}"
    except ApiException as e:
        error_message = f"Failed to delete VeFaaS function: {str(e)}"
        raise ValueError(error_message)

@mcp.tool(description="""Checks the release status of a VeFaaS function.
Use this when you need to check the release status of a VeFaaS function.
Region is the region where the function exists, default is cn-beijing. It accepts `ap-southeast-1`, `cn-beijing`, 
`cn-shanghai`, `cn-guangzhou` as well.
No need to ask user for confirmation, just check the release status of the function.""")
def get_function_release_status(function_id: str, region: str = None):
    api_instance = init_client(region)
    req = volcenginesdkvefaas.GetReleaseStatusRequest(
        function_id=function_id
    )
    response = api_instance.get_release_status(req)
    return response

@mcp.tool(description="""Checks if a VeFaaS function exists.
Use this when you need to check if a VeFaaS function exists.
No need to ask user for confirmation, just check if the function exists.""")
def does_function_exist(function_id: str, region: str = None):
    api_instance = init_client(region)
    req = volcenginesdkvefaas.GetFunctionRequest(
        id=function_id
    )
    try:
        response = api_instance.get_function(req)
        return True
    except ApiException as e:
        return False

@mcp.tool(description="""Lists all VeFaaS functions.
Use this when you need to list all VeFaaS functions.
No need to ask user for confirmation, just list the functions.""")
def get_latest_functions(region: str = None):
    api_instance = init_client(region)
    req = volcenginesdkvefaas.ListFunctionsRequest(
        page_number=1,
        page_size=5
    )
    response = api_instance.list_functions(req)
    return response

def generate_random_name(prefix="mcp", length=8):
    """Generate a random string for function name"""
    random_str = "".join(
        random.choices(string.ascii_lowercase + string.digits, k=length)
    )
    return f"{prefix}-{random_str}"

def init_client(region: str = None):
    """Set up VeFaaS configuration with credentials from environment variables"""
    if "ACCESS_KEY_ID" not in os.environ:
        raise ValueError("ACCESS_KEY_ID environment variable is not set")
    if "ACCESS_KEY_SECRET" not in os.environ:
        raise ValueError("ACCESS_KEY_SECRET environment variable is not set")

    ak = os.environ["ACCESS_KEY_ID"]
    sk = os.environ["ACCESS_KEY_SECRET"]

    configuration = volcenginesdkcore.Configuration()
    configuration.ak = ak
    configuration.sk = sk

    # Set region with default if needed
    region = region if region is not None else "cn-beijing"
    print(f"Using region: {region}")
    configuration.region = region
    
    # set default configuration
    volcenginesdkcore.Configuration.set_default(configuration)
    return volcenginesdkvefaas.VEFAASApi()

@mcp.tool(description="""Creates a base64-encoded zip file containing a Python script.
Use this when you need to package Python code into a base64-encoded zip file.""")
def create_zip_from_code(code: str) -> str:
    # Create a temporary directory
    with tempfile.TemporaryDirectory() as temp_dir:
        # Create index.py with the provided code
        index_path = os.path.join(temp_dir, "index.py")
        with open(index_path, "w") as f:
            f.write(code)

        # Create zip file
        zip_path = os.path.join(temp_dir, "function.zip")
        with zipfile.ZipFile(zip_path, "w", zipfile.ZIP_DEFLATED) as zf:
            zf.write(index_path, "index.py")

        # Read and encode the zip file
        with open(zip_path, "rb") as f:
            zip_content = f.read()
            base64_content = base64.b64encode(zip_content).decode("utf-8")

        return base64_content

def main():
    mcp.run(transport="stdio")

if __name__ == "__main__":
    main()
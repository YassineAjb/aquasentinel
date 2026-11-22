# SAKIYA --- Technical Product Specification

**Document type:** Product and technical specification\
**Version:** 0.1 --- Working draft\
**Date:** 20 November 2026\
**Status:** Concept definition / prototype planning

------------------------------------------------------------------------

## 1. Product overview

**SAKIYA** is an AI-assisted geospatial and environmental
monitoring platform. It combines satellite imagery, geographic
information, environmental datasets, and optional field observations to
help users understand the condition of a selected area and monitor how
it changes over time.

The platform is intended to turn complex geospatial and environmental
data into understandable maps, indicators, analyses, alerts, and
reports.

Agricultural land is the initial concrete use case. The product concept
can later be extended to broader environmental monitoring, including
vegetation change, drought-related indicators, and land degradation.

### Product vision

Make environmental and geospatial intelligence easier to access,
interpret, and use for monitoring and decision support.

### Product positioning

SAKIYA is an **environmental intelligence platform**, not simply
an irrigation controller or a satellite-image viewer.

------------------------------------------------------------------------

## 2. Problem statement

Environmental and agricultural monitoring can be difficult because:

-   Satellite imagery, geographic information, and weather or
    environmental datasets are often spread across separate sources.
-   Raw imagery and geospatial datasets can be difficult for
    non-specialists to interpret.
-   Changes in vegetation or land conditions may not be identified
    early.
-   Comparing the condition of a site across different dates requires
    data preparation and analysis.
-   Users need a clear way to move from raw data to meaningful
    indicators and decision-support information.

**Central problem statement**

How can satellite imagery and environmental data be transformed into
accessible, comparable, and actionable information that helps users
monitor geographical areas and identify potential environmental changes
or risks?

------------------------------------------------------------------------

## 3. Proposed solution

SAKIYA provides a workflow for defining a site, collecting
relevant data, processing imagery, calculating environmental indicators,
comparing observations over time, and presenting the results in a
unified interface.

The proposed workflow is:

1.  The user creates a monitoring site.
2.  The user identifies the area using a map, coordinates, or an
    uploaded boundary.
3.  SAKIYA retrieves available satellite imagery and relevant
    environmental datasets for that area and period.
4.  The imagery pipeline prepares the data for visualization and
    analysis.
5.  The analysis modules calculate indicators and identify changes or
    anomalies.
6.  The platform presents maps, charts, explanations, and reports.

The user should not need to manually source and prepare every dataset
for routine monitoring. Data acquisition should be automated where
supported by the selected providers.

------------------------------------------------------------------------

## 4. Target users and initial use case

### Potential users

-   Farmers and agricultural operators.
-   Agricultural cooperatives.
-   Environmental monitoring teams.
-   Land and natural-resource managers.
-   Researchers and technical analysts.
-   Public or private organizations monitoring geographical areas.

These are intended user groups; customer requirements and willingness to
pay still need validation.

### Initial use case: agricultural field monitoring

A user registers an agricultural site, defines its boundary, and selects
a monitoring period. SAKIYA retrieves available imagery and
environmental information, calculates vegetation indicators, and
presents the field's condition and changes over time.

The initial demonstration should focus on one clearly defined site
rather than claiming to monitor every environmental domain.

------------------------------------------------------------------------

## 5. Main product modules

### 5.1 Site and Geospatial Management

**Purpose:** Define and manage the geographical areas being monitored.

**Responsibilities** - Create, edit, and archive monitoring sites. -
Select a location on an interactive map. - Draw or upload a field
boundary. - Support geographic formats such as GeoJSON; additional
formats can be added later. - Store site coordinates, area, perimeter,
and descriptive metadata. - Associate monitoring runs and observations
with a site.

**Inputs** - Coordinates or map selection. - User-drawn polygon. -
Uploaded geographic boundary. - Site name and optional land-use
information.

**Outputs** - Site geometry. - Calculated area and perimeter. - Site
profile and monitoring boundary.

### 5.2 Satellite Imagery Intelligence

**Purpose:** Acquire, prepare, manage, and visualize satellite imagery
for a selected site.

**Responsibilities** - Search for imagery covering the selected boundary
and time period. - Retrieve imagery from configured providers. - Apply
cloud and data-quality filtering where supported. - Prepare image
composites for display. - Manage image metadata, acquisition dates,
sensor information, and processing history. - Integrate the selected
image-resolution enhancement approach. - Preserve original source
imagery and derived products separately.

**Important image-quality principle**

Enhanced imagery may improve visual presentation, but it must not be
treated as new ground-truth information. Scientific measurements must
use appropriate original or scientifically validated source data.
Enhanced images should be clearly identified as derived visual products.

**Inputs** - Site boundary and date range. - Satellite scenes and
spectral bands from configured providers. - Cloud or quality metadata. -
Enhancement model or processing method.

**Outputs** - Original imagery references. - Processed imagery and
display tiles. - Image-quality metadata. - Enhanced visual products,
clearly labelled. - Historical imagery catalogue.

### 5.3 Environmental and Vegetation Analysis

**Purpose:** Calculate interpretable indicators from suitable source
datasets.

**Initial capabilities** - Calculate NDVI from appropriate multispectral
bands. - Produce field-level statistics such as mean, minimum, and
maximum values. - Summarize valid-pixel coverage. - Visualize spatial
variation within a field. - Compare indicator values across dates. -
Identify areas that may warrant further inspection.

**Potential future capabilities** - Additional vegetation indices. -
Land-cover analysis. - Soil or surface indicators where appropriate
input data exists. - Crop-specific interpretation after validation.

**Inputs** - Original multispectral imagery and metadata. - Site
boundary. - Acquisition date. - Validity and cloud masks.

**Outputs** - Index rasters or map layers. - Field-level statistics. -
Charts and spatial summaries. - Data-quality indicators.

### 5.4 Temporal Monitoring and Change Detection

**Purpose:** Track how a site changes across multiple observations.

**Responsibilities** - Organize observations chronologically. - Compare
compatible images and indicators from different dates. - Display
before-and-after views. - Calculate changes in selected indicators. -
Identify unusual changes that may need review. - Maintain a history of
monitoring runs.

**Inputs** - Multiple dated observations. - Consistent site geometry. -
Comparable imagery or derived indicators.

**Outputs** - Time series. - Change maps. - Before-and-after
comparisons. - Candidate change events with dates and supporting
evidence.

Comparisons must account for differences in acquisition date, cloud
cover, sensor, spatial resolution, and processing. A visual difference
alone should not automatically be described as environmental
degradation.

### 5.5 AI and Environmental Risk Intelligence

**Purpose:** Turn validated observations into useful analytical
assistance.

**Proposed capabilities** - Detect anomalous patterns in environmental
indicators. - Flag possible vegetation stress. - Identify candidate
drought-related patterns when suitable data is available. - Prioritize
areas for human inspection. - Generate plain-language explanations of
detected changes. - Provide evidence-linked summaries and
recommendations for further investigation.

**Design principles** - Separate measured values from model-generated
interpretations. - Explain which inputs support each finding. -
Communicate uncertainty and data limitations. - Avoid presenting an
anomaly as a confirmed cause or diagnosis. - Keep a human review step
for consequential decisions.

**Inputs** - Validated analysis outputs. - Historical observations. -
Optional weather and environmental datasets. - Model outputs and
confidence information.

**Outputs** - Anomaly flags. - Risk indicators. - Explanations and
supporting evidence. - Suggested follow-up actions.

AI capabilities are proposed and should be introduced incrementally. The
platform must not claim predictive accuracy until it has been evaluated
against suitable reference data.

### 5.6 Dashboard and Reporting

**Purpose:** Make the platform's information understandable and
actionable.

**Proposed screens** - **Overview:** monitored sites, latest
observations, and important alerts. - **Site Explorer:** map, boundary,
and site details. - **Imagery Viewer:** original and processed imagery
with date selection. - **Environmental Analysis:** vegetation layers,
statistics, and charts. - **Change Monitoring:** historical comparisons
and time series. - **Risk Intelligence:** anomalies, explanations, and
review status. - **Reports:** downloadable summaries of a site and
monitoring period.

**Outputs** - Interactive maps. - Image comparisons. - Charts and
indicators. - Alert and event lists. - Exportable monitoring reports.

------------------------------------------------------------------------

## 6. Input data specification

SAKIYA combines several input categories. Not every category is
required for every analysis.

  -----------------------------------------------------------------------
  Input category          Examples                Requirement
  ----------------------- ----------------------- -----------------------
  Site geometry           Polygon, coordinates,   Required to define a
                          GeoJSON                 monitoring area

  Satellite imagery       Multispectral scenes,   Required for
                          image bands,            satellite-based
                          acquisition metadata    analysis

  Image quality metadata  Cloud cover, masks,     Required where relevant
                          valid-pixel information to assess data quality

  Weather data            Rainfall, temperature,  Optional; needed only
                          humidity, wind,         for analyses that use
                          forecasts               it

  Environmental data      Land cover, soil        Optional and dependent
                          characteristics,        on the use case
                          water-related datasets  

  User observations       Crop type, field        Optional; useful for
                          activity, photographs,  context and validation
                          notes                   
  -----------------------------------------------------------------------

### Data provenance

For each acquired or derived dataset, the platform should retain, where
available:

-   Source/provider.
-   Acquisition date and time.
-   Spatial resolution.
-   Coordinate reference system.
-   Sensor and band information.
-   Cloud or quality metadata.
-   Processing method and version.
-   Whether the asset is original or derived.

------------------------------------------------------------------------

## 7. System workflow

``` text
User creates a monitoring site
            |
            v
Site boundary and monitoring period
            |
            v
Satellite and environmental data acquisition
            |
            v
Data validation and preprocessing
            |
            +------------------------------+
            |                              |
            v                              v
Original multispectral data       Display-image pipeline
            |                     (enhancement if configured)
            v                              |
Vegetation / environmental analysis       |
            |                              |
            +---------------+--------------+
                            |
                            v
             Temporal comparison and change analysis
                            |
                            v
              AI-assisted anomaly interpretation
                            |
                            v
             Dashboard, alerts, and reports
```

The display-image pipeline and scientific-analysis pipeline must remain
distinct. This prevents visually enhanced imagery from silently
replacing source data in quantitative calculations.

------------------------------------------------------------------------

## 8. Proposed technical architecture

The following is a proposed architecture, not a claim that every
component has already been implemented.

### 8.1 Logical layers

1.  **Client layer:** Web or mobile interface for site management, maps,
    imagery, charts, and reports.
2.  **Application API:** Authentication, site management, monitoring
    jobs, and access to results.
3.  **Geospatial processing:** Boundary operations, raster processing,
    reprojection, clipping, and derived map layers.
4.  **Imagery acquisition:** Connectors to satellite imagery providers
    and catalogues.
5.  **Analysis services:** Vegetation indices, temporal comparisons, and
    quality checks.
6.  **AI services:** Anomaly detection and evidence-based explanations.
7.  **Storage:** Relational metadata storage and object storage for
    imagery and derived assets.
8.  **Visualization:** Map services, image tiles, charts, and report
    generation.

### 8.2 Candidate technologies

Technology choices should be confirmed against the existing repository
and deployment environment.

  -----------------------------------------------------------------------
  Layer                               Candidate technology
  ----------------------------------- -----------------------------------
  Frontend                            Flutter or a dedicated web frontend

  Backend API                         NestJS

  Geospatial processing               Python, GDAL, Rasterio, GeoPandas

  Satellite data access               Google Earth Engine and/or
                                      provider-specific APIs

  Geospatial database                 PostgreSQL with PostGIS

  Raster/object storage               S3-compatible object storage or
                                      equivalent

  Real-time updates                   WebSockets where needed

  Charts                              fl_chart for Flutter or an
                                      equivalent web chart library

  AI/ML                               Python-based models and analysis
                                      services

  Deployment                          Docker on a server or suitable edge
                                      devices
  -----------------------------------------------------------------------

These are candidate choices. The project should avoid introducing every
technology unless it serves a concrete requirement.

### 8.3 Processing jobs

Potential background jobs include:

-   Search and retrieve imagery.
-   Validate scene metadata and quality.
-   Generate composites and map tiles.
-   Run image enhancement.
-   Calculate vegetation indices.
-   Generate temporal comparisons.
-   Run anomaly analysis.
-   Produce reports.

Long-running geospatial processing should be handled as asynchronous
jobs rather than blocking ordinary API requests.

------------------------------------------------------------------------

## 9. Hardware and edge-computing constraints

The initial brainstorming documented the following available equipment:

-   Four Raspberry Pi 5 devices.
-   Five small solar panels.
-   Internet connectivity was available in the proposed setup.

The original hardware plan was revised because additional IoT materials
could not be purchased or borrowed.

### Recommended use of available hardware

Raspberry Pi devices may be evaluated for: - Edge processing
experiments. - Scheduled data acquisition or preprocessing. - Local
caching of datasets. - Running selected lightweight services. -
Demonstrating distributed processing.

The five solar panels may be used for a separate energy demonstration
only after their electrical specifications and safe power arrangement
are verified.

### Constraints and safety

-   Do not assume the panels can directly power Raspberry Pi 5 devices.
-   Verify panel voltage/current characteristics and the required power
    regulation.
-   Do not connect panels directly to Raspberry Pi power pins.
-   Avoid promising autonomous field sensing when no physical sensors
    are available.
-   The platform's core geospatial workflow should work without physical
    IoT sensors.

The exact allocation of tasks across the four Raspberry Pis is not yet
finalized.

------------------------------------------------------------------------

## 10. Image-resolution enhancement requirements

Image enhancement is an important planned capability because visual
quality affects the usability of the imagery viewer.

### Functional requirements

-   Accept supported source imagery.
-   Apply the selected enhancement method.
-   Preserve the original asset.
-   Store the derived output separately.
-   Record model or algorithm version and processing parameters.
-   Allow users to compare original and enhanced imagery.
-   Label enhanced imagery as a derived visualization.

### Validation requirements

The enhancement method should be evaluated for: - Visual quality. -
Sharpness and artifact generation. - Preservation of field boundaries
and visible structures. - Consistency across different scenes. -
Suitability for the intended display scale.

**Scientific limitation:** Super-resolution can generate plausible
visual detail that was not directly observed by the sensor. Enhanced
imagery must not be used as a substitute for original multispectral
measurements or as proof of small objects or changes.

------------------------------------------------------------------------

## 11. Functional requirements summary

  ID      Requirement                                           Priority
  ------- ----------------------------------------------------- ----------
  FR-01   Create and manage monitoring sites                    Must
  FR-02   Define a site using a map or geographic file          Must
  FR-03   Retrieve satellite imagery for a site and period      Must
  FR-04   Store image metadata and acquisition dates            Must
  FR-05   Apply appropriate cloud and quality filtering         Must
  FR-06   Display imagery over the site boundary                Must
  FR-07   Calculate NDVI from valid source bands                Must
  FR-08   Display field-level statistics                        Must
  FR-09   Compare observations from different dates             Should
  FR-10   Integrate and label image enhancement                 Should
  FR-11   Generate candidate change or anomaly flags            Should
  FR-12   Provide explanations linked to evidence               Could
  FR-13   Generate downloadable monitoring reports              Should
  FR-14   Support optional weather and environmental datasets   Could

------------------------------------------------------------------------

## 12. Non-functional requirements

### Reliability

-   Failed acquisition or processing jobs should be visible and
    retryable.
-   Missing data should be reported rather than silently treated as
    zero.
-   The application should distinguish unavailable data from a negative
    finding.

### Performance

-   Use asynchronous jobs for expensive processing.
-   Cache reusable imagery and analysis outputs.
-   Generate map tiles or suitable image derivatives for responsive
    visualization.
-   Avoid repeatedly processing unchanged inputs.

### Traceability

-   Retain source and processing metadata.
-   Record analysis dates and software/model versions.
-   Make it possible to trace a displayed indicator to its source
    dataset.

### Usability

-   Present maps and indicators with clear legends and units.
-   Explain technical indicators in accessible language.
-   Distinguish observations, estimates, and AI-generated
    interpretations.

### Security

-   Authenticate users and protect site data.
-   Apply authorization to site and report access.
-   Protect provider credentials and API keys.
-   Validate uploaded geographic files.

------------------------------------------------------------------------

## 13. MVP scope

The MVP should demonstrate a complete, credible monitoring workflow for
one or a small number of sites.

### MVP --- Essential

-   Create a monitoring site.
-   Draw or upload a field boundary.
-   Retrieve satellite imagery for the selected area.
-   Apply cloud and data-quality filtering.
-   Display the imagery on a map.
-   Calculate NDVI using original multispectral data.
-   Display field-level statistics.
-   Show the date and source of each observation.

### MVP --- Next iteration

-   Integrate and evaluate the image-resolution enhancement method.
-   Add an original-versus-enhanced image comparison.
-   Add historical image and NDVI comparisons.
-   Generate a basic monitoring report.

### Later iterations

-   Environmental anomaly detection.
-   Drought-related indicators using suitable supporting datasets.
-   AI-generated explanations and recommendations.
-   Alerts and scheduled monitoring.
-   Additional environmental domains and data providers.
-   Edge-processing experiments using Raspberry Pi devices.

The MVP should prioritize a reliable end-to-end workflow over a large
number of unvalidated AI features.

------------------------------------------------------------------------

## 14. Added value

SAKIYA's intended value is to:

1.  **Centralize information:** Bring site geometry, satellite imagery,
    and environmental indicators into one workflow.
2.  **Improve visualization:** Make imagery easier to inspect through
    suitable processing and enhancement.
3.  **Support early investigation:** Flag potential changes or anomalies
    for further review.
4.  **Enable historical monitoring:** Compare observations and
    understand how a site evolves.
5.  **Simplify interpretation:** Present complex data through maps,
    statistics, charts, and explanations.
6.  **Support decisions:** Give users evidence that can inform field
    inspections and environmental management.

SAKIYA supports decision-making; it does not replace on-site
verification or qualified environmental assessment.

------------------------------------------------------------------------

## 15. Success criteria

The prototype should be evaluated using measurable criteria:

-   A user can create a site and define its boundary.
-   The platform can retrieve imagery for the selected site and dates.
-   The imagery source, date, and quality information are visible.
-   NDVI is calculated from appropriate original bands.
-   Field statistics can be reproduced from the source data.
-   Original and enhanced imagery can be distinguished.
-   Historical comparisons use compatible observations.
-   Potential anomalies link to the data that triggered them.
-   The user can generate a concise site-monitoring report.

Any claimed improvement in image resolution or environmental detection
should be supported by a documented evaluation rather than visual
impression alone.

------------------------------------------------------------------------

## 16. Risks and limitations

  -----------------------------------------------------------------------
  Risk                                Mitigation
  ----------------------------------- -----------------------------------
  Cloud cover or missing scenes       Search alternate dates and expose
                                      data gaps

  Coarse native spatial resolution    Use suitable higher-resolution
                                      sources where available; label
                                      enhancement clearly

  Super-resolution artifacts          Preserve originals and validate
                                      outputs

  Incompatible temporal observations  Check dates, sensors, resolution,
                                      and processing consistency

  False anomaly detections            Show evidence, uncertainty, and
                                      human review status

  Limited ground-truth data           Avoid unsupported accuracy claims
                                      and plan field validation

  Processing cost or latency          Use asynchronous jobs, caching, and
                                      scoped processing

  Limited hardware                    Keep the core workflow
                                      cloud/data-driven and treat edge
                                      deployment as optional
  -----------------------------------------------------------------------

------------------------------------------------------------------------

## 17. Current project status and open decisions

### Confirmed from the project work so far

-   Google Earth Engine has been used for satellite data exploration.
-   Sentinel-2 imagery has been retrieved.
-   Cloud masking has been applied.
-   A field boundary has been analyzed.
-   NDVI statistics have been generated.
-   The earlier field report recorded 37 satellite scenes and an average
    NDVI of approximately 0.2573 for that particular analysis.
-   The project has four Raspberry Pi 5 devices and five small solar
    panels available, according to the initial hardware constraints.
-   A solution for improving satellite image resolution has been found,
    but its method and validation have not yet been specified in this
    document.

### Decisions still to confirm

-   Exact image-enhancement method, model, and source imagery
    compatibility.
-   Satellite and high-resolution imagery providers.
-   Final frontend and backend stack.
-   Storage and deployment architecture.
-   Whether the first release targets agricultural users or a broader
    environmental-monitoring audience.
-   Which environmental risks will be included in the first validated
    release.
-   Whether and how Raspberry Pi devices will participate in production
    processing.
-   Ground-truth data and validation methodology.

------------------------------------------------------------------------

## 18. Product summary

**SAKIYA is an AI-assisted geospatial and environmental monitoring
platform that combines satellite imagery, geographic information, and
environmental datasets to visualize land conditions, analyze vegetation,
track changes over time, and identify potential environmental risks.**

Its first implementation should focus on a clear agricultural monitoring
workflow: define a site, retrieve and prepare imagery, calculate
reliable environmental indicators, compare observations, and present the
results through an accessible dashboard.

The product's credibility depends on traceable source data,
scientifically appropriate measurements, transparent uncertainty, and
clear separation between observed information and AI-generated
interpretation.

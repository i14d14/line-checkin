---
name: software-architecture
description: Load when architecting, designing, evaluating, or refactoring medium-to-large software projects (e.g. multi-domain systems, persistent database schemas, distributed architectures, multiple integration channels, or codebases where any single file approaches or exceeds 300 LOC). Enforces the Laws of Software Architecture, architectural quanta analysis, trade-off evaluation, modularity/connascence metrics, ADR standards, automated fitness functions, risk storming, and elastic leadership. Do not load for small standalone scripts, single-file tools, or simple CLI utilities.
---

# Software Architecture: Engineering Approach & Decision Framework

Use this foundational knowledge, core engineering principles, and operational procedures to design, analyze, govern, and refactor software systems.

---

## 1. Core Architectural Definition & Laws

### The Four Dimensions of Software Architecture
Architecture is not merely a blueprint or code structure. It consists of four interrelated dimensions:
1. **Structure:** The overarching architecture style and topology (e.g., Layered, Microkernel, Service-Based, Event-Driven, Microservices).
2. **Architecture Characteristics ("-ilities"):** The system's operational, structural, and cross-cutting success criteria orthogonal to domain functionality (e.g., scalability, elasticity, fault tolerance, deployability).
3. **Architecture Decisions:** Hard constraints and non-negotiable rules governing how the system must be constructed (e.g., "Layer X may not directly access Layer Z").
4. **Design Principles:** Soft guidelines and best-practice recommendations that guide development teams in making choices without rigid dictates (e.g., "Prefer asynchronous messaging for high-throughput service communication").

### The Fundamental Laws of Software Architecture
* **First Law:** *Everything in software architecture is a trade-off.*
  * If an architect believes they have found a solution with no downsides, they simply have not identified the trade-offs yet.
  * Never shoot for the "best" architecture; design for the **least worst set of trade-offs**.
* **Second Law:** *Why is more important than how.*
  * Anyone can observe *how* a system is implemented by reading code or topology diagrams. Only the rationale (*why* specific trade-offs were made) preserves system integrity and prevents catastrophic regressions during future maintenance.
* **Strategic Design vs. Tactical Programming:**
  * Software spends ~80% of its lifecycle in maintenance and evolution. Invest in simplicity, clear abstractions, and low discovery cost (strategic design) rather than short-term feature hacks (tactical programming).

---

## 2. Architectural Thinking & Knowledge Breadth

### Technical Breadth vs. Technical Depth
* **The Knowledge Pyramid:**
  * *Stuff you know* (Technical Depth): Technologies used daily. Requires heavy time investment to maintain expertise.
  * *Stuff you know you don't know* (Technical Breadth): Technologies known by name, capabilities, and trade-offs, but not daily syntax.
  * *Stuff you don't know you don't know*: Unexplored possibilities.
* **Architectural Mandate:**
  * As a developer transitions to an architect, **breadth becomes more valuable than depth**. It is far better to know five possible solutions and their trade-offs than to be an expert in only one.
  * Avoid the **Frozen Caveman Anti-Pattern**: Reverting to irrational pet concerns or outdated technical criteria from past traumas (e.g., "what if we lose Italy?").
  * Maintain technical breadth using the **20-Minute Rule** (dedicate 20 minutes every morning to scanning tech radar, reading whitepapers, and exploring new paradigms before checking email) and maintain a **Personal Technology Radar** (Hold, Assess, Trial, Adopt).

### Architecture vs. Design Collaboration
* Architecture defines components, characteristics, cross-boundary contracts, and operational topology. Design determines internal class structures, design patterns, and private implementation algorithms.
* Break down the unidirectional barrier between architect and developer to avoid the **Ivory Tower Architect Anti-Pattern**. Both must form a tight, bidirectional collaborative loop.

---

## 3. Architecture Characteristics & Scope

### Criteria for an Architecture Characteristic
An attribute qualifies as an architecture characteristic if and only if it:
1. Specifies a **non-domain design consideration** (operational or technical metric).
2. Directly **influences the physical or logical structure** of the design.
3. Is **critical or important to application success**.

### Characteristic Categories
1. **Operational:** Performance, Scalability (concurrent users), Elasticity (handling sudden traffic bursts), Availability, Reliability, Recoverability, Fault Tolerance.
2. **Structural:** Modularity, Maintainability, Testability, Deployability, Portability, Upgradeability, Extensibility.
3. **Cross-Cutting:** Security (Authentication, Authorization, Encryption), Privacy, Auditability, Legal/Regulatory Compliance (GDPR, HIPAA).

### Explicit vs. Implicit Characteristics
* **Explicit:** Directly documented in business requirements (e.g., "Must support 100,000 concurrent users").
* **Implicit:** Unstated but vital to survival, derived from domain context (e.g., sudden lunch-hour traffic bursts require elasticity; transaction workflows require reliability and auditability).
* **Anti-Pattern — Generic Architecture (The Vasa Syndrome):** Never attempt to design a generic architecture that maximizes all characteristics. Strive to identify the **top three driving characteristics** with stakeholders.

### Architectural Quanta & Granularity
* **Architectural Quantum:** An independently deployable artifact with high functional cohesion and synchronous connascence.
  * Includes all components necessary to function independently (e.g., application code, database, external dependencies).
  * Systems sharing a single database or bound by synchronous inter-service dependencies collapse into a **single quantum** ($Quantum = 1$).
  * A system with multiple quanta requires distributed architectures to accommodate disparate operational characteristics across domains.

---

## 4. Modularity Metrics & Connascence

### Cohesion Metrics
Cohesion measures how unified the contents of a module are. Cohesion types from best to worst:
1. **Functional:** Module contains only elements essential to perform a single cohesive business function.
2. **Sequential:** Output of one element forms the input of the next.
3. **Communicational:** Elements operate on or contribute to the same data/output chain.
4. **Procedural:** Elements execute in a mandatory sequence.
5. **Temporal:** Elements grouped solely because they execute at the same time (e.g., system startup).
6. **Logical:** Elements logically grouped by category but functionally unrelated (e.g., generic `StringUtils`).
7. **Coincidental:** Elements reside in the same file with no logical or functional relationship (pure anti-pattern).
* **LCOM (Lack of Cohesion in Methods):** Quantifies methods within a class that do not share private fields. High LCOM indicates accidental coupling and candidate extraction targets.

### Coupling & Main Sequence Metrics
* **Afferent Coupling ($C_a$):** Number of incoming dependencies to a module (incoming/fan-in).
* **Efferent Coupling ($C_e$):** Number of outgoing dependencies from a module (outgoing/fan-out).
* **Abstractness ($A$):** Ratio of abstract elements (interfaces/abstract classes) to total elements:
  $$A = \frac{\sum m^a}{\sum m^c}$$
* **Instability ($I$):** Volatility and fragility of a code base under change:
  $$I = \frac{C_e}{C_e + C_a}$$
  ($I=0$: completely stable and hard to change; $I=1$: highly volatile and unstable).
* **Distance from the Main Sequence ($D$):**
  $$D = |A + I - 1|$$
  * $D \approx 0$: Balanced trade-off between abstraction and stability.
  * **Zone of Pain ($A \approx 0, I \approx 0$):** High implementation, concrete, rigid, difficult to change, heavily depended upon.
  * **Zone of Uselessness ($A \approx 1, I \approx 1$):** Overly abstract, decoupled, unused indirection with excessive discovery cost.

### Connascence (The Modern Coupling Metric)
Two software elements are connascent if a change in one forces a change in the other to preserve system correctness.
* **Static Connascence (Source Code Level):**
  * *Connascence of Name (CoN):* Agreement on entity/method names (weakest, most refactoring-friendly).
  * *Connascence of Type (CoT):* Agreement on argument/property types.
  * *Connascence of Meaning (CoM) / Convention (CoC):* Agreement on magic numbers, flags, or string semantics.
  * *Connascence of Position (CoP):* Agreement on order of parameters.
  * *Connascence of Algorithm (CoA):* Shared cryptographic hashing or encoding logic.
* **Dynamic Connascence (Runtime Level):**
  * *Connascence of Execution (CoE):* Mandatory execution sequence of methods.
  * *Connascence of Timing (CoT):* Race conditions and timing-dependent thread interactions.
  * *Connascence of Values (CoV):* Dependent values across distributed transactional boundaries.
  * *Connascence of Identity (CoI):* Multiple components sharing and mutating a single stateful instance (e.g., shared distributed queue).
* **Guiding Rules:**
  * **Rule of Degree:** Convert strong forms of connascence into weaker forms (e.g., replace CoM magic values with CoN constants or typed objects).
  * **Rule of Locality:** As the distance between software elements increases (within function $\rightarrow$ within class $\rightarrow$ cross-module $\rightarrow$ cross-service), enforce weaker forms of connascence.

---

## 5. Component Identification & Partitioning

### Component Scope & Discovery
* Components are the primary structural building blocks an architect directly designs, manages, and governs.
* **Anti-Pattern — The Entity Trap:** Do not mechanically map database tables directly to Manager components (e.g., `CustomerManager`, `OrderManager`). This represents object-relational database mirroring rather than workflow architecture.
* **Discovery Strategies:**
  * *Actor/Actions Approach:* Map candidate components to actors and the actions they initiate.
  * *Workflow Approach:* Trace operational workflows and extract coarse-grained boundaries.
  * *Event Storming:* Model business domain events and design components around event emitters and consumers.

### Top-Level Architecture Partitioning
* **Technical Partitioning:** Components organized horizontally by technical tier (Presentation, Business, Persistence, Database).
  * *Advantages:* High separation of technical concerns; standard layer conventions.
  * *Disadvantages:* High global coupling; business domains are smeared across all layers; low agility for domain feature changes.
* **Domain Partitioning:** Components organized vertically around business domains and workflows (e.g., Checkout, Invoicing, Inventory).
  * *Advantages:* Aligns with Domain-Driven Design (DDD) Bounded Contexts; supports the **Inverse Conway Maneuver** (stream-aligned cross-functional teams); straightforward migration path from Modular Monolith to Microservices.
  * *Disadvantages:* Shared cross-cutting customization code must be carefully structured via adapters or plugins.

---

## 6. Architecture Styles & Distributed Systems Reality

### Monolithic Styles
1. **Layered Architecture:**
   * Logical horizontal tiers.
   * **Layers of Isolation:** Enforce *closed layers* (requests must pass through consecutive layers) to isolate change. Open layers should be an explicit, justified exception (e.g., optional shared services).
   * **Anti-Pattern — Architecture Sinkhole:** >20% of requests simply passing through layers without adding business logic indicates the style is ill-suited.
2. **Pipeline Architecture (Pipes & Filters):**
   * Unidirectional, point-to-point data flow between independent, stateless filters (Producer, Transformer, Tester, Consumer). Ideal for ETL, compilers, and streaming telemetry.
3. **Microkernel Architecture (Plug-in):**
   * Minimal Core System (happy path) + standalone Plug-in components registered via a Plug-in Registry and strict Contracts.
   * Perfect for domain/architecture isomorphism requiring high user or tenant customizability without bloat.
4. **Modular Monolith:**
   * Single deployment unit, single database, strictly bounded domain-partitioned packages with explicit public interfaces and zero cyclic dependencies.

### Distributed Styles & Fallacies
1. **The 8 Fallacies of Distributed Computing:**
   Never assume: (1) The network is reliable, (2) Latency is zero, (3) Bandwidth is infinite, (4) The network is secure, (5) Topology never changes, (6) There is only one administrator, (7) Transport cost is zero, (8) The network is homogeneous.
2. **Service-Based Architecture:**
   * 4–12 coarse-grained domain services sharing a centrally partitioned database. Pragmatic middle ground offering deployment agility without microservices distributed transaction overhead.
3. **Event-Driven Architecture (EDA):**
   * *Broker Topology:* Lightweight message broker (pub/sub topics), highly decoupled, responsive, relay-race style. Trade-off: lack of central workflow control and complex error handling.
   * *Mediator Topology:* Central event orchestrator directs message queues. Trade-off: orchestration bottleneck, higher coupling, but clear workflow control and restartability.
   * *Asynchronous Error Handling:* Use the **Workflow Event Pattern** (delegate error fixing to a workflow processor/dashboard) without stalling consumers.
   * *Preventing Data Loss:* Implement Persistent Queues, Synchronous Send, Client Acknowledge Mode, and Last Participant Support (LPS).
   * *Pseudosynchronous (Request-Reply):* Correlate async messages using a `Correlation ID` in message headers.
4. **Space-Based Architecture:**
   * Eliminates central database bottlenecks by keeping active transactional data in replicated in-memory data grids (Processing Units) with asynchronous Data Pumps, Data Writers, and Data Readers.
   * Designed for extreme elasticity (e.g., ticket sales, bidding systems). Monitor data collision risks using:
     $$\text{Collision Rate} = N \times \frac{UR^2}{S} \times RL$$
5. **Microservices Architecture:**
   * Fine-grained, single-purpose, independently deployed domain services with isolated data stores (database per service).
   * Operational reuse via the **Sidecar Pattern** and **Service Mesh** (service plane for logging, tracing, discovery).
   * Frontend integration via **BFF (Backends for Frontends)** or **Microfrontends**.
   * **Distributed Transactions:** Avoid transactions across boundaries by adjusting service granularity. If strictly necessary, implement the **Saga Pattern** with compensating transactions.
   * Mitigate **Stamp Coupling** (transferring redundant fat payloads across the wire) using field selectors, private endpoints, or GraphQL.

### Style Decision Principles
* Default to **Synchronous communication** within bounded contexts; utilize **Asynchronous communication** across boundaries or when isolating disparate operational characteristics.
* If a system has only 1 architectural quantum, favor a **monolithic style** (Layered or Modular Monolith). If multiple distinct quanta exist with opposing -ility demands, choose a **distributed style**.

---

## 7. Architecture Decision Records (ADRs)

### Standard ADR Structure
Every architecturally significant decision must be documented as an ADR:
1. **Title:** Sequential number and descriptive action (e.g., `ADR-014: Use Asynchronous Pub/Sub for Payment Notification`).
2. **Status:** `Proposed`, `Accepted`, `Superseded` (must reference the superseding ADR and vice-versa), or `RFC` (with a firm review deadline).
3. **Context:** The specific operational forces, requirements, and constraints necessitating the decision, along with evaluated alternatives.
4. **Decision:** An affirmative, commanding statement (e.g., "We will...") emphasizing the **Why over How**, complete with business and technical justifications.
5. **Consequences:** Comprehensive impact analysis, including trade-offs accepted, technical debt incurred, and negative ramifications.
6. **Compliance:** How the decision will be governed and verified (e.g., automated CI fitness function, static analysis rule, or scheduled audit).
7. **Notes:** Metadata (author, approval date, review board members).

### Decision Anti-Patterns to Overcome
* **Covering Your Assets (CYA):** Delaying decisions out of fear of making mistakes. Overcome by deciding at the *Last Responsible Moment* and collaborating continuously with developers.
* **Groundhog Day:** Re-arguing settled decisions endlessly. Overcome by explicitly capturing the *justifications and trade-offs* in the ADR.
* **Email-Driven Architecture:** Scattering decisions across emails or chats. Overcome by establishing a single immutable source of record (e.g., Git-versioned ADR directory or Architecture Wiki).

---

## 8. Architecture Governance & Automated Fitness Functions

Do not rely on manual code reviews alone to protect architectural boundaries. Implement automated fitness functions in CI/CD pipelines:
* **Dependency Rule Linting:** Fail builds on forbidden layer violations (e.g., Presentation directly importing Persistence).
* **Cycle Detection:** Automatically prevent cyclic dependencies between packages or components (e.g., using ArchUnit, NetArchTest, or dependency-cruiser).
* **Distance from Main Sequence Bounds:** Monitor metric drift away from the ideal balance line.
* **Chaos Engineering:** Continuous verification of operational resilience (e.g., Simian Army patterns, latency injection, kill-switch testing).

---

## 9. Architecture Risk Assessment & Risk Storming

### The Architecture Risk Matrix
Quantify risk across system components:
$$\text{Risk Score} = \text{Impact} \times \text{Likelihood}$$
* Impact: Low (1), Medium (2), High (3)
* Likelihood: Low (1), Medium (2), High (3)
* Scores: 1–2 (Low / Green), 3–4 (Medium / Yellow), 6–9 (High / Red).
* **Rule for Unknowns:** For unproven, new, or unvetted technologies, always assign the maximum risk score of **9**.

### Risk Storming Procedure
1. **Individual Identification:** Participants independently review the architecture diagram and assign risk markers (color-coded with criteria) without consulting peers, preventing anchoring bias and groupthink.
2. **Collaborative Consensus:** Post all risk markers on the shared diagram. Discuss discrepancies (e.g., why one rater tagged an element as 6 and another as 2) and converge on consensus ratings.
3. **Mitigation & Trade-off Negotiation:** Formulate concrete mitigations for high-risk (Red) nodes. Negotiate trade-offs between mitigation cost and residual risk with business stakeholders.

---

## 10. Elastic Leadership & Team Dynamics

### Elastic Leadership (Calibrating Architectural Control)
An effective architect avoids both extremes: **Control Freak** (over-constraining developers, writing pseudocode, micromanaging class designs) and **Armchair Architect** (drawing meaningless high-level boxes, disconnected from code reality, abandoning the team).
Calibrate control based on five factors:
1. **Team Familiarity:** Unfamiliar teams require more active onboarding and clearer boundaries; mature teams require facilitation.
2. **Team Size:** Larger teams (>12) demand firmer governance; small teams (≤4) thrive with lighter ritual.
3. **Experience Level:** Junior-heavy teams need hands-on mentoring and code pairing; senior teams need strategic guardrails.
4. **Project Complexity:** High algorithmic or distributed complexity warrants close architectural availability.
5. **Project Duration:** Short urgent projects require eliminating bottlenecks; multi-year initiatives require disciplined governance to avoid scope creep.

### Warning Signs of Dysfunctional Teams
* **Process Loss (Brooks's Law):** Adding personnel decreases actual output due to communication friction and merge conflicts. Seek parallelization or partition the architecture.
* **Pluralistic Ignorance:** Team members privately disagree with an architectural direction but publicly conform out of fear of looking foolish. Actively solicit dissenting viewpoints.
* **Diffusion of Responsibility:** Ambiguity over ownership leading to dropped tasks as team size expands. Clearly define component ownership.

### Communication & Negotiation Rules
* **The 4 C's:** *Communication*, *Collaboration*, *Clarity*, *Conciseness*.
* **Demonstration Defeats Discussion:** When facing contentious debates between technologies (e.g., REST vs. Messaging), build a quick production-like Proof of Concept (POC) to let benchmark data resolve the argument.
* **Justification First:** When communicating architectural decisions to engineers, lead with the business/technical reason and context before stating the constraint to prevent defensive resistance.

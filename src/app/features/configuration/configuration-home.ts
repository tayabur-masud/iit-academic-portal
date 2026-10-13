import { Component } from '@angular/core';
import { RouterLink } from '@angular/router';

import { GROUPS, RESOURCES } from './configuration.models';

/** The Configuration landing page: every resource an Admin can maintain, grouped. */
@Component({
  selector: 'app-configuration-home',
  imports: [RouterLink],
  templateUrl: './configuration-home.html',
})
export class ConfigurationHome {
  protected readonly groups = GROUPS.map((name) => ({
    name,
    resources: RESOURCES.filter((resource) => resource.group === name),
  }));
}
